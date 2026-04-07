# Database

SQLite, stored as `data/kanban.db` inside the Docker container. Created and seeded automatically on first startup if it does not exist.

## Schema

Four tables: `users`, `boards`, `columns`, `cards`. Full definition in `docs/schema.json`.

```
users
  id, username, password_hash

boards
  id, user_id → users.id, title

columns
  id, board_id → boards.id, title, position

cards
  id, column_id → columns.id, title, details, position
```

All foreign keys use `ON DELETE CASCADE`.

## Design decisions

**Integer IDs.** SQLite auto-increment integers are used for all primary keys. The API converts them to strings for the frontend (matching the current `"card-1"` / `"col-backlog"` format).

**Position column for ordering.** Both `columns` and `cards` have a `position` integer. When a card is moved, the backend updates positions for the affected rows. This avoids linked-list complexity while keeping ordering explicit.

**One board per user.** For MVP, each user has exactly one board created at seed time. The `boards` table is designed for multiple boards in the future.

**Password hashing.** `password_hash` stores a bcrypt hash. For MVP the single user (`user` / `password`) is seeded on startup. The plaintext password is never stored.

## Seed data

On first startup the backend creates the database, runs migrations, and inserts:
- 1 user: `user` (bcrypt hash of `password`)
- 1 board for that user
- 5 columns: Backlog, Discovery, In Progress, Review, Done

Subsequent startups detect the existing file and skip seeding.

## API shape (for Part 6)

The backend will serve the board as the same JSON structure the frontend already uses:

```json
{
  "columns": [
    { "id": "1", "title": "Backlog", "cardIds": ["1", "2"] }
  ],
  "cards": {
    "1": { "id": "1", "title": "Align roadmap themes", "details": "..." }
  }
}
```

This keeps the frontend changes minimal in Part 7.
