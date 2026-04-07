import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ai import BoardUpdate, AIResponse, build_system_prompt, chat, chat_structured
from database import get_db, init_db

# Load .env from project root for local dev (no-op in Docker where env vars are injected)
load_dotenv(Path(__file__).parent.parent / ".env")

# MVP: single hardcoded user. Replace with session auth in future.
MVP_USER_ID = 1

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler — initialises the database before serving requests."""
    init_db()
    yield


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CardOut(BaseModel):
    """API response shape for a single card. IDs are strings to match the frontend store."""

    id: str
    title: str
    details: str


class ColumnOut(BaseModel):
    """API response shape for a single column, including an ordered list of card IDs."""

    id: str
    title: str
    cardIds: list[str]


class BoardOut(BaseModel):
    """Full board response: ordered columns and a flat card lookup map."""

    columns: list[ColumnOut]
    cards: dict[str, CardOut]


class RenameColumnIn(BaseModel):
    """Request body for ``PATCH /api/columns/{column_id}``."""

    title: str


class AddCardIn(BaseModel):
    """Request body for ``POST /api/cards``."""

    column_id: int
    title: str
    details: str = ""


class UpdateCardIn(BaseModel):
    """Request body for ``PATCH /api/cards/{card_id}``."""

    title: str
    details: str


class MoveCardIn(BaseModel):
    """Request body for ``POST /api/cards/{card_id}/move``."""

    column_id: int
    position: int  # 0-indexed target position within the destination column


class ChatMessage(BaseModel):
    """A single message in the AI conversation history."""

    role: str     # "user" or "assistant"
    content: str


class AIChatIn(BaseModel):
    """Request body for ``POST /api/ai/chat``."""

    message: str
    history: list[ChatMessage] = []  # Prior turns for multi-turn context


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_board_id(conn: sqlite3.Connection) -> int:
    """Return the board ID for the MVP user, or raise HTTP 404 if not found."""
    row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (MVP_USER_ID,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return row["id"]


def _require_column(conn: sqlite3.Connection, column_id: int, board_id: int) -> sqlite3.Row:
    """Fetch a column row, raising HTTP 404 if it does not belong to *board_id*."""
    row = conn.execute(
        "SELECT * FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")
    return row


def _require_card(conn: sqlite3.Connection, card_id: int, board_id: int) -> sqlite3.Row:
    """Fetch a card row, raising HTTP 404 if the card does not belong to *board_id*.

    Ownership is verified via a JOIN through the card's column.
    """
    row = conn.execute(
        """
        SELECT cards.* FROM cards
        JOIN columns ON cards.column_id = columns.id
        WHERE cards.id = ? AND columns.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    return row


def _renormalize_column(conn: sqlite3.Connection, column_id: int) -> None:
    """Reassign card positions in *column_id* as contiguous integers starting from 0.

    Called after a deletion to close gaps left by the removed card.
    """
    rows = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position, id", (column_id,)
    ).fetchall()
    for i, row in enumerate(rows):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, row["id"]))


def _move_card_in_db(
    conn: sqlite3.Connection,
    card_id: int,
    target_column_id: int,
    target_position: int,
) -> None:
    """Relocate *card_id* to *target_column_id* at *target_position*.

    Handles both intra-column reordering and cross-column moves by rebuilding
    the ordered ID lists for the source and destination columns, inserting the
    card at the requested index, and writing back the new positions in bulk.
    """
    card = conn.execute(
        "SELECT column_id FROM cards WHERE id = ?", (card_id,)
    ).fetchone()
    if not card:
        return
    source_column_id = card["column_id"]

    source_ids = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position",
            (source_column_id, card_id),
        ).fetchall()
    ]
    if target_column_id == source_column_id:
        target_ids = source_ids[:]
    else:
        target_ids = [
            r["id"]
            for r in conn.execute(
                "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
                (target_column_id,),
            ).fetchall()
        ]

    insert_at = min(target_position, len(target_ids))
    target_ids.insert(insert_at, card_id)

    conn.execute("UPDATE cards SET column_id = ? WHERE id = ?", (target_column_id, card_id))
    for i, cid in enumerate(source_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, cid))
    for i, cid in enumerate(target_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, cid))


def _build_board(conn: sqlite3.Connection, board_id: int) -> BoardOut:
    """Assemble a ``BoardOut`` response from the current database state.

    Fetches all columns and cards for *board_id* in a single query each,
    then groups cards by column to produce the nested structure expected by
    the frontend.
    """
    cols = conn.execute(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    all_cards = conn.execute(
        """
        SELECT cards.* FROM cards
        JOIN columns ON cards.column_id = columns.id
        WHERE columns.board_id = ?
        ORDER BY cards.column_id, cards.position
        """,
        (board_id,),
    ).fetchall()

    cards_by_column: dict[int, list[sqlite3.Row]] = {col["id"]: [] for col in cols}
    for card in all_cards:
        cards_by_column[card["column_id"]].append(card)

    columns_out = [
        ColumnOut(
            id=str(col["id"]),
            title=col["title"],
            cardIds=[str(c["id"]) for c in cards_by_column[col["id"]]],
        )
        for col in cols
    ]
    cards_out = {
        str(c["id"]): CardOut(id=str(c["id"]), title=c["title"], details=c["details"])
        for c in all_cards
    }
    return BoardOut(columns=columns_out, cards=cards_out)


def _build_board_for_ai(conn: sqlite3.Connection, board_id: int) -> dict:
    """Board representation with integer IDs for the AI system prompt."""
    cols = conn.execute(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    return {
        "columns": [
            {
                "id": col["id"],
                "title": col["title"],
                "cards": [
                    {"id": c["id"], "title": c["title"], "details": c["details"]}
                    for c in conn.execute(
                        "SELECT * FROM cards WHERE column_id = ? ORDER BY position",
                        (col["id"],),
                    ).fetchall()
                ],
            }
            for col in cols
        ]
    }


def _apply_board_update(
    conn: sqlite3.Connection, update: BoardUpdate, board_id: int
) -> None:
    """Apply AI-generated board mutations to the database.

    Iterates through each mutation list in *update* (add, move, delete, rename)
    and executes the corresponding SQL. Ownership of every column and card is
    validated against *board_id* before any write; unknown IDs are silently
    skipped so a single bad AI instruction does not abort the whole update.
    """
    for action in update.add_cards:
        col = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?",
            (action.column_id, board_id),
        ).fetchone()
        if not col:
            continue
        position = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE column_id = ?", (action.column_id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (action.column_id, action.title, action.details, position),
        )

    for action in update.move_cards:
        card = conn.execute(
            """
            SELECT cards.id FROM cards
            JOIN columns ON cards.column_id = columns.id
            WHERE cards.id = ? AND columns.board_id = ?
            """,
            (action.card_id, board_id),
        ).fetchone()
        if not card:
            continue
        col = conn.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?",
            (action.column_id, board_id),
        ).fetchone()
        if not col:
            continue
        _move_card_in_db(conn, action.card_id, action.column_id, action.position)

    for action in update.delete_cards:
        row = conn.execute(
            """
            SELECT cards.column_id FROM cards
            JOIN columns ON cards.column_id = columns.id
            WHERE cards.id = ? AND columns.board_id = ?
            """,
            (action.card_id, board_id),
        ).fetchone()
        if row:
            conn.execute("DELETE FROM cards WHERE id = ?", (action.card_id,))
            _renormalize_column(conn, row["column_id"])

    for action in update.rename_columns:
        conn.execute(
            "UPDATE columns SET title = ? WHERE id = ? AND board_id = ?",
            (action.title, action.column_id, board_id),
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/board", response_model=BoardOut)
def get_board(conn: sqlite3.Connection = Depends(get_db)):
    """Return the full board state: ordered columns and a flat card map."""
    board_id = _get_board_id(conn)
    return _build_board(conn, board_id)


@app.patch("/api/columns/{column_id}")
def rename_column(
    column_id: int,
    body: RenameColumnIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Update the title of a column."""
    board_id = _get_board_id(conn)
    _require_column(conn, column_id, board_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (body.title, column_id))
    return {"ok": True}


@app.post("/api/cards", response_model=CardOut, status_code=201)
def add_card(body: AddCardIn, conn: sqlite3.Connection = Depends(get_db)):
    """Create a new card at the end of the specified column."""
    board_id = _get_board_id(conn)
    _require_column(conn, body.column_id, board_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE column_id = ?", (body.column_id,)
    ).fetchone()[0]
    cursor = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (body.column_id, body.title, body.details, position),
    )
    card_id = cursor.lastrowid
    return CardOut(id=str(card_id), title=body.title, details=body.details)


@app.patch("/api/cards/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    body: UpdateCardIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Update the title and details of an existing card."""
    board_id = _get_board_id(conn)
    _require_card(conn, card_id, board_id)
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (body.title, body.details, card_id),
    )
    return CardOut(id=str(card_id), title=body.title, details=body.details)


@app.delete("/api/cards/{card_id}", status_code=204)
def delete_card(card_id: int, conn: sqlite3.Connection = Depends(get_db)):
    """Delete a card and renormalize positions in its former column."""
    board_id = _get_board_id(conn)
    card = _require_card(conn, card_id, board_id)
    column_id = card["column_id"]
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renormalize_column(conn, column_id)


@app.post("/api/cards/{card_id}/move")
def move_card(
    card_id: int,
    body: MoveCardIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Move a card to a target column at a target position."""
    board_id = _get_board_id(conn)
    _require_card(conn, card_id, board_id)
    _require_column(conn, body.column_id, board_id)
    _move_card_in_db(conn, card_id, body.column_id, body.position)
    return {"ok": True}


@app.get("/api/ai/test")
def ai_test():
    """Connectivity check — sends '2+2' to the model and returns the answer."""
    result = chat([{"role": "user", "content": "What is 2+2? Reply with just the number."}])
    return {"result": result}


@app.post("/api/ai/chat")
def ai_chat(body: AIChatIn, conn: sqlite3.Connection = Depends(get_db)):
    """Process a user message through the AI and apply any resulting board mutations.

    Builds a prompt with the current board state, sends the conversation history
    plus the new message to the model, applies the structured ``board_update``
    response to the database, and returns the AI's reply alongside the updated board.
    """
    board_id = _get_board_id(conn)
    board_for_ai = _build_board_for_ai(conn, board_id)

    messages = [
        {"role": "system", "content": build_system_prompt(board_for_ai)},
        *[m.model_dump() for m in body.history],
        {"role": "user", "content": body.message},
    ]

    ai_response = chat_structured(messages)
    _apply_board_update(conn, ai_response.board_update, board_id)
    updated_board = _build_board(conn, board_id)

    return {"message": ai_response.message, "board": updated_board}


# Mount static files last so API routes take priority
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
