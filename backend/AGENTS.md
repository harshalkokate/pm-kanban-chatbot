# Backend

FastAPI Python backend. Serves static files from `../static/` at `/` and exposes API routes at `/api/`.

## Setup

Uses `uv` as the package manager. Dependencies in `pyproject.toml`.

```bash
uv sync --dev          # install all deps including pytest/httpx
uv run pytest tests/   # run tests
uv run uvicorn main:app --reload --port 8000  # local dev server
```

## Files

- `main.py` — FastAPI app, all routes, Pydantic models
- `database.py` — SQLite connection, schema creation (`create_tables`), seeding (`seed`), startup init (`init_db`)
- `tests/conftest.py` — pytest fixture: in-memory SQLite db, overrides `get_db` dependency
- `tests/test_board.py` — 25 tests covering all endpoints

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/board` | Full board state (columns + cards) |
| PATCH | `/api/columns/{id}` | Rename a column |
| POST | `/api/cards` | Add a card `{column_id, title, details}` |
| PATCH | `/api/cards/{id}` | Update card title/details |
| DELETE | `/api/cards/{id}` | Delete a card |
| POST | `/api/cards/{id}/move` | Move card `{column_id, position}` |

## Response shape

`GET /api/board` returns the same `BoardData` structure the frontend uses:
```json
{
  "columns": [{ "id": "1", "title": "Backlog", "cardIds": ["1", "2"] }],
  "cards": { "1": { "id": "1", "title": "...", "details": "..." } }
}
```

IDs are integers in SQLite, returned as strings to match the frontend.

## Database

SQLite at `../data/kanban.db` (relative to backend/). Created and seeded on first startup. See `docs/DATABASE.md` for schema details.

MVP uses `user_id=1` for all routes (hardcoded). See `MVP_USER_ID` constant in `main.py`.
