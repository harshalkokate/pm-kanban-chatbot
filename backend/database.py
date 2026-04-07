import os
import sqlite3
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


def _open(path: Path) -> sqlite3.Connection:
    """Open a SQLite connection to *path* with foreign keys enabled.

    Sets ``row_factory = sqlite3.Row`` so callers can access columns by name.
    ``check_same_thread=False`` is required because FastAPI may hand the
    connection off between threads within a single request.
    """
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def create_tables(conn: sqlite3.Connection) -> None:
    """Create all application tables if they do not already exist.

    Uses ``CREATE TABLE IF NOT EXISTS`` so this function is safe to call on
    every startup — it is a no-op when the schema is already in place.
    """
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS boards (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title   TEXT NOT NULL DEFAULT 'My Board'
        );
        CREATE TABLE IF NOT EXISTS columns (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            title    TEXT NOT NULL,
            position INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cards (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
            title     TEXT NOT NULL,
            details   TEXT NOT NULL DEFAULT '',
            position  INTEGER NOT NULL
        );
    """)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def seed(conn: sqlite3.Connection) -> None:
    """Insert the default user, board, and five columns."""
    password_hash = bcrypt.hashpw(b"password", bcrypt.gensalt()).decode()
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        ("user", password_hash),
    )
    user_id = cursor.lastrowid
    cursor = conn.execute(
        "INSERT INTO boards (user_id, title) VALUES (?, 'My Board')", (user_id,)
    )
    board_id = cursor.lastrowid
    for i, title in enumerate(DEFAULT_COLUMNS):
        conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, i),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Init (called at startup)
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Bootstrap the database on application startup.

    Creates the ``data/`` directory if it does not exist, applies the schema,
    and seeds the default user and board when the database is empty.
    Called once from the FastAPI ``lifespan`` context manager.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = _open(DB_PATH)
    try:
        create_tables(conn)
        conn.commit()
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            seed(conn)
    finally:
        conn.close()
