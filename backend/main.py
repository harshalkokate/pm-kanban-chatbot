"""FastAPI application entry point.

Routes are grouped by concern:

* Auth (``/api/auth/...``): register, login, logout, me.
* Boards (``/api/boards``, ``/api/boards/{id}``): CRUD for a user's boards.
* Board contents (``/api/boards/{id}/columns/...``, ``/api/boards/{id}/cards/...``):
  per-board column and card operations, including AI chat.

All per-board routes require the authenticated user to own the board; ownership
is verified in :func:`_require_board_for_user`.
"""
import json
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Load .env BEFORE importing ``ai`` so the OpenAI client reads the key at
# construction. Docker injects env vars directly, but ``uv run`` relies on this.
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from ai import BoardUpdate, build_system_prompt, chat, chat_structured
from auth import (
    create_session,
    delete_session,
    get_current_user,
    get_current_user_id,
    verify_password,
)
from database import (
    VALID_PRIORITIES,
    create_board_with_defaults,
    create_user,
    get_db,
    init_db,
)

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan, title="PM App")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class AuthOut(BaseModel):
    token: str
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str


class BoardSummary(BaseModel):
    id: int
    title: str
    position: int
    card_count: int


class BoardCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class BoardUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    position: Optional[int] = None


class CardOut(BaseModel):
    id: str
    title: str
    details: str
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    labels: list[str] = Field(default_factory=list)


class ColumnOut(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardOut(BaseModel):
    id: int
    title: str
    columns: list[ColumnOut]
    cards: dict[str, CardOut]


class RenameColumnIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class AddCardIn(BaseModel):
    column_id: int
    title: str = Field(min_length=1, max_length=200)
    details: str = ""
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    labels: list[str] = Field(default_factory=list)

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v):
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(VALID_PRIORITIES)}")
        return v


class UpdateCardIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    details: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    labels: Optional[list[str]] = None
    clear_priority: bool = False
    clear_due_date: bool = False
    clear_assignee: bool = False

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v):
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(VALID_PRIORITIES)}")
        return v


class MoveCardIn(BaseModel):
    column_id: int
    position: int


class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatIn(BaseModel):
    message: str
    history: list[ChatMessage] = []


AuthOut.model_rebuild()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_board_for_user(
    conn: sqlite3.Connection, board_id: int, user_id: int
) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return row


def _require_column(conn: sqlite3.Connection, column_id: int, board_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")
    return row


def _require_card(conn: sqlite3.Connection, card_id: int, board_id: int) -> sqlite3.Row:
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

    insert_at = max(0, min(target_position, len(target_ids)))
    target_ids.insert(insert_at, card_id)

    conn.execute("UPDATE cards SET column_id = ? WHERE id = ?", (target_column_id, card_id))
    for i, cid in enumerate(source_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, cid))
    for i, cid in enumerate(target_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, cid))


def _card_to_out(row: sqlite3.Row) -> CardOut:
    try:
        labels = json.loads(row["labels"] or "[]")
        if not isinstance(labels, list):
            labels = []
    except (json.JSONDecodeError, TypeError):
        labels = []
    return CardOut(
        id=str(row["id"]),
        title=row["title"],
        details=row["details"],
        priority=row["priority"],
        due_date=row["due_date"],
        assignee=row["assignee"],
        labels=[str(l) for l in labels],
    )


def _build_board(conn: sqlite3.Connection, board_row: sqlite3.Row) -> BoardOut:
    board_id = board_row["id"]
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
    cards_out = {str(c["id"]): _card_to_out(c) for c in all_cards}
    return BoardOut(
        id=board_id, title=board_row["title"], columns=columns_out, cards=cards_out
    )


def _build_board_for_ai(conn: sqlite3.Connection, board_id: int) -> dict:
    cols = conn.execute(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    return {
        "columns": [
            {
                "id": col["id"],
                "title": col["title"],
                "cards": [
                    {
                        "id": c["id"],
                        "title": c["title"],
                        "details": c["details"],
                        "priority": c["priority"],
                        "due_date": c["due_date"],
                        "assignee": c["assignee"],
                    }
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
    """Apply AI-generated mutations, validating every ID against *board_id*."""
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
            "INSERT INTO cards (column_id, title, details, position, labels) VALUES (?, ?, ?, ?, '[]')",
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
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, conn: sqlite3.Connection = Depends(get_db)):
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (body.username,)
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    try:
        user_id = create_user(conn, body.username, body.password)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username already taken")
    create_board_with_defaults(conn, user_id, "My Board")
    token = create_session(conn, user_id)
    return AuthOut(token=token, user=UserOut(id=user_id, username=body.username))


@app.post("/api/auth/login", response_model=AuthOut)
def login(body: LoginIn, conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (body.username,)
    ).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(conn, row["id"])
    return AuthOut(token=token, user=UserOut(id=row["id"], username=row["username"]))


@app.post("/api/auth/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(get_current_user),
):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(None, 1)[1]
        delete_session(conn, token)


@app.get("/api/auth/me", response_model=UserOut)
def me(current_user: sqlite3.Row = Depends(get_current_user)):
    return UserOut(id=current_user["id"], username=current_user["username"])


# ---------------------------------------------------------------------------
# Board CRUD
# ---------------------------------------------------------------------------

@app.get("/api/boards", response_model=list[BoardSummary])
def list_boards(
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    rows = conn.execute(
        """
        SELECT b.id, b.title, b.position,
               (SELECT COUNT(*) FROM cards c
                JOIN columns col ON c.column_id = col.id
                WHERE col.board_id = b.id) AS card_count
        FROM boards b
        WHERE b.user_id = ?
        ORDER BY b.position, b.id
        """,
        (user_id,),
    ).fetchall()
    return [
        BoardSummary(id=r["id"], title=r["title"], position=r["position"], card_count=r["card_count"])
        for r in rows
    ]


@app.post("/api/boards", response_model=BoardSummary, status_code=201)
def create_board(
    body: BoardCreateIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    board_id = create_board_with_defaults(conn, user_id, body.title)
    row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
    return BoardSummary(id=row["id"], title=row["title"], position=row["position"], card_count=0)


@app.get("/api/boards/{board_id}", response_model=BoardOut)
def get_board(
    board_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    board = _require_board_for_user(conn, board_id, user_id)
    return _build_board(conn, board)


@app.patch("/api/boards/{board_id}", response_model=BoardSummary)
def update_board(
    board_id: int,
    body: BoardUpdateIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    if body.title is not None:
        conn.execute("UPDATE boards SET title = ? WHERE id = ?", (body.title, board_id))
    if body.position is not None:
        conn.execute("UPDATE boards SET position = ? WHERE id = ?", (body.position, board_id))
    row = conn.execute(
        """
        SELECT b.id, b.title, b.position,
               (SELECT COUNT(*) FROM cards c
                JOIN columns col ON c.column_id = col.id
                WHERE col.board_id = b.id) AS card_count
        FROM boards b WHERE b.id = ?
        """,
        (board_id,),
    ).fetchone()
    return BoardSummary(id=row["id"], title=row["title"], position=row["position"], card_count=row["card_count"])


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(
    board_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    remaining = conn.execute(
        "SELECT COUNT(*) FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    if remaining <= 1:
        raise HTTPException(
            status_code=400, detail="Cannot delete your last board"
        )
    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


# ---------------------------------------------------------------------------
# Column routes
# ---------------------------------------------------------------------------

@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_column(
    board_id: int,
    column_id: int,
    body: RenameColumnIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    _require_column(conn, column_id, board_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (body.title, column_id))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Card routes
# ---------------------------------------------------------------------------

@app.post("/api/boards/{board_id}/cards", response_model=CardOut, status_code=201)
def add_card(
    board_id: int,
    body: AddCardIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    _require_column(conn, body.column_id, board_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE column_id = ?", (body.column_id,)
    ).fetchone()[0]
    cursor = conn.execute(
        """
        INSERT INTO cards (column_id, title, details, position, priority, due_date, assignee, labels, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
        """,
        (
            body.column_id,
            body.title,
            body.details,
            position,
            body.priority,
            body.due_date,
            body.assignee,
            json.dumps(body.labels),
        ),
    )
    row = conn.execute("SELECT * FROM cards WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _card_to_out(row)


@app.patch("/api/boards/{board_id}/cards/{card_id}", response_model=CardOut)
def update_card(
    board_id: int,
    card_id: int,
    body: UpdateCardIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    _require_card(conn, card_id, board_id)

    updates: list[tuple[str, object]] = []
    if body.title is not None:
        updates.append(("title", body.title))
    if body.details is not None:
        updates.append(("details", body.details))
    if body.clear_priority:
        updates.append(("priority", None))
    elif body.priority is not None:
        updates.append(("priority", body.priority))
    if body.clear_due_date:
        updates.append(("due_date", None))
    elif body.due_date is not None:
        updates.append(("due_date", body.due_date))
    if body.clear_assignee:
        updates.append(("assignee", None))
    elif body.assignee is not None:
        updates.append(("assignee", body.assignee))
    if body.labels is not None:
        updates.append(("labels", json.dumps(body.labels)))

    if updates:
        set_sql = ", ".join(f"{col} = ?" for col, _ in updates)
        params = [val for _, val in updates] + [card_id]
        conn.execute(f"UPDATE cards SET {set_sql} WHERE id = ?", params)

    row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    return _card_to_out(row)


@app.delete("/api/boards/{board_id}/cards/{card_id}", status_code=204)
def delete_card(
    board_id: int,
    card_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    card = _require_card(conn, card_id, board_id)
    column_id = card["column_id"]
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renormalize_column(conn, column_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_card(
    board_id: int,
    card_id: int,
    body: MoveCardIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _require_board_for_user(conn, board_id, user_id)
    _require_card(conn, card_id, board_id)
    _require_column(conn, body.column_id, board_id)
    _move_card_in_db(conn, card_id, body.column_id, body.position)
    return {"ok": True}


# ---------------------------------------------------------------------------
# AI routes
# ---------------------------------------------------------------------------

@app.get("/api/ai/test")
def ai_test(_user: sqlite3.Row = Depends(get_current_user)):
    result = chat([{"role": "user", "content": "What is 2+2? Reply with just the number."}])
    return {"result": result}


@app.post("/api/boards/{board_id}/ai/chat")
def ai_chat(
    board_id: int,
    body: AIChatIn,
    conn: sqlite3.Connection = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    board = _require_board_for_user(conn, board_id, user_id)
    board_for_ai = _build_board_for_ai(conn, board_id)

    messages = [
        {"role": "system", "content": build_system_prompt(board_for_ai)},
        *[m.model_dump() for m in body.history],
        {"role": "user", "content": body.message},
    ]

    try:
        ai_response = chat_structured(messages)
    except Exception as exc:
        # Surface OpenRouter/OpenAI errors (auth, rate limit, bad JSON) to the
        # client instead of a generic 500 so the chat widget can show them.
        raise HTTPException(status_code=502, detail=f"AI request failed: {exc}")

    _apply_board_update(conn, ai_response.board_update, board_id)
    updated_board = _build_board(conn, board)

    return {"message": ai_response.message, "board": updated_board}


# ---------------------------------------------------------------------------
# Static files (must be mounted last so API routes take priority)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
