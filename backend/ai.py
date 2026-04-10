import json
import os

from openai import OpenAI
from pydantic import BaseModel, Field

MODEL = "openai/gpt-oss-120b"

# Lazy client construction so ``OPENROUTER_API_KEY`` is read at the first call
# (after ``load_dotenv`` runs in ``main.py``), not at module import time.
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY", ""),
        )
    return _client


class _ClientProxy:
    """Backwards-compat shim so ``ai.openai_client.chat.completions.create`` still works.

    Existing tests patch ``ai.openai_client.chat.completions.create``; proxying
    through ``_get_client()`` keeps those patches working while ensuring the
    real client picks up env vars set after import time.
    """

    @property
    def chat(self):  # pragma: no cover - thin passthrough
        return _get_client().chat


openai_client = _ClientProxy()


# ---------------------------------------------------------------------------
# Structured output models
# ---------------------------------------------------------------------------

class CardAdd(BaseModel):
    """Instruction to create a new card in a column."""

    column_id: int
    title: str
    details: str = ""


class CardMove(BaseModel):
    """Instruction to move an existing card to a (possibly different) column at a given position."""

    card_id: int
    column_id: int
    position: int  # 0-indexed target position within the destination column


class CardDelete(BaseModel):
    """Instruction to permanently delete a card."""

    card_id: int


class ColumnRename(BaseModel):
    """Instruction to change a column's display title."""

    column_id: int
    title: str


class BoardUpdate(BaseModel):
    """Aggregated set of board mutations returned by the AI in a single response."""

    add_cards: list[CardAdd] = Field(default_factory=list)
    move_cards: list[CardMove] = Field(default_factory=list)
    delete_cards: list[CardDelete] = Field(default_factory=list)
    rename_columns: list[ColumnRename] = Field(default_factory=list)


class AIResponse(BaseModel):
    """Top-level structured output expected from the language model."""

    message: str  # Natural-language reply shown to the user
    board_update: BoardUpdate = Field(default_factory=BoardUpdate)


# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------

def chat(messages: list[dict]) -> str:
    """Send a plain chat request and return the model's text response.

    Used by the ``/api/ai/test`` connectivity check endpoint.
    """
    response = openai_client.chat.completions.create(
        model=MODEL,
        messages=messages,
    )
    return response.choices[0].message.content


def _extract_json(raw: str) -> str:
    """Extract the first top-level JSON object from *raw*.

    Some models wrap JSON in a ```` ```json ... ``` ```` fence or leak a few
    words of prose around it. This scrapes the first ``{ ... }`` block with
    balanced braces so validation still succeeds.
    """
    start = raw.find("{")
    if start == -1:
        return raw
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return raw[start : i + 1]
    return raw


def chat_structured(messages: list[dict]) -> AIResponse:
    """Send a chat request and parse the response as a structured ``AIResponse``.

    Requests a JSON object from the model (``response_format={"type": "json_object"}``)
    and validates the payload against the ``AIResponse`` Pydantic model. Falls
    back to ``_extract_json`` if the model leaks surrounding prose.
    """
    response = openai_client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
        max_tokens=8192,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("No response from AI")
    try:
        return AIResponse.model_validate_json(content)
    except Exception:
        return AIResponse.model_validate_json(_extract_json(content))


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def build_system_prompt(board: dict) -> str:
    """Build the system prompt for the AI, embedding the current board state as JSON.

    The board dict uses integer IDs (not the string IDs sent to the frontend) so the
    model can reference them directly in ``board_update`` actions.
    """
    return f"""You are a helpful Kanban board assistant. The user's current board is:

{json.dumps(board, indent=2)}

You help users manage their board by answering questions and making changes they request.
You can create cards, move cards between columns, delete cards, and rename columns.

Always respond with a JSON object in this exact format:
{{
  "message": "Your helpful response to the user",
  "board_update": {{
    "add_cards":      [{{"column_id": <int>, "title": "<str>", "details": "<str>"}}],
    "move_cards":     [{{"card_id": <int>, "column_id": <int>, "position": <int>}}],
    "delete_cards":   [{{"card_id": <int>}}],
    "rename_columns": [{{"column_id": <int>, "title": "<str>"}}]
  }}
}}

Rules:
- All lists in board_update may be empty when no changes are needed.
- Only include mutations the user explicitly requested.
- Use the exact integer IDs shown in the board JSON above.
- position is 0-indexed within the target column after the move."""
