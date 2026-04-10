"""SQLite schema, connection helper, and bootstrap logic.

The schema supports multiple users, each owning multiple boards. Cards carry
optional metadata (priority, due date, assignee, labels) to back the richer
project management features. Sessions are server-side, keyed by a random
token issued at login.
"""
import os
import sqlite3
import time
from pathlib import Path

import bcrypt

DB_PATH = Path(os.getenv("DB_PATH", str(Path(__file__).parent.parent / "data" / "kanban.db")))


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_db():
    """FastAPI dependency — yields an open, committed-on-success connection."""
    conn = _open(DB_PATH)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _open(path) -> sqlite3.Connection:
    """Open a SQLite connection with foreign keys enabled and Row factory set."""
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}


def create_tables(conn: sqlite3.Connection) -> None:
    """Create all application tables if they do not exist. Safe to call repeatedly."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS boards (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title      TEXT NOT NULL DEFAULT 'My Board',
            position   INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
        CREATE TABLE IF NOT EXISTS columns (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            title    TEXT NOT NULL,
            position INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id);
        CREATE TABLE IF NOT EXISTS cards (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            column_id  INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
            title      TEXT NOT NULL,
            details    TEXT NOT NULL DEFAULT '',
            position   INTEGER NOT NULL,
            priority   TEXT,
            due_date   TEXT,
            assignee   TEXT,
            labels     TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id);
    """)


# ---------------------------------------------------------------------------
# User / board creation helpers (used by auth routes and seeding)
# ---------------------------------------------------------------------------

def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    """Insert a new user and return the row id. Raises sqlite3.IntegrityError on duplicate."""
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, password_hash, int(time.time())),
    )
    return cursor.lastrowid


def create_board_with_defaults(
    conn: sqlite3.Connection, user_id: int, title: str = "My Board"
) -> int:
    """Create a board for *user_id* plus the five default columns. Returns the board id."""
    position = conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]
    cursor = conn.execute(
        "INSERT INTO boards (user_id, title, position, created_at) VALUES (?, ?, ?, ?)",
        (user_id, title, position, int(time.time())),
    )
    board_id = cursor.lastrowid
    for i, col_title in enumerate(DEFAULT_COLUMNS):
        conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, col_title, i),
        )
    return board_id


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed(conn: sqlite3.Connection) -> None:
    """Insert the legacy default user ('user'/'password') and one board.

    Preserved so existing deployments and manual smoke tests continue to work.
    """
    user_id = create_user(conn, "user", "password")
    create_board_with_defaults(conn, user_id, "My Board")
    conn.commit()


# ---------------------------------------------------------------------------
# Init (called at startup)
# ---------------------------------------------------------------------------

def _migrate(conn: sqlite3.Connection) -> None:
    """Apply lightweight ALTER TABLE migrations to older databases.

    Uses ``PRAGMA table_info`` to detect missing columns and adds them with
    sensible defaults. Safe to run repeatedly.
    """
    def columns_of(table: str) -> set[str]:
        return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}

    def add(table: str, ddl: str) -> None:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")

    if "created_at" not in columns_of("users"):
        add("users", "created_at INTEGER NOT NULL DEFAULT 0")
    board_cols = columns_of("boards")
    if "position" not in board_cols:
        add("boards", "position INTEGER NOT NULL DEFAULT 0")
    if "created_at" not in board_cols:
        add("boards", "created_at INTEGER NOT NULL DEFAULT 0")
    card_cols = columns_of("cards")
    for ddl in (
        ("priority", "priority TEXT"),
        ("due_date", "due_date TEXT"),
        ("assignee", "assignee TEXT"),
        ("labels", "labels TEXT NOT NULL DEFAULT '[]'"),
        ("created_at", "created_at INTEGER NOT NULL DEFAULT 0"),
    ):
        if ddl[0] not in card_cols:
            add("cards", ddl[1])


def init_db() -> None:
    """Bootstrap the database: create the file, apply schema, run migrations, seed if empty."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = _open(DB_PATH)
    try:
        create_tables(conn)
        _migrate(conn)
        conn.commit()
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            seed(conn)
    finally:
        conn.close()
