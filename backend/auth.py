"""Authentication helpers: password hashing, session tokens, and the
``get_current_user`` FastAPI dependency.

Sessions are stored server-side in the ``sessions`` table. The client sends
its opaque bearer token in the ``Authorization: Bearer <token>`` header;
``get_current_user`` validates it and returns the user row.
"""
from __future__ import annotations

import secrets
import sqlite3
import time
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, status

from database import get_db

SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password* as a UTF-8 string."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if *password* matches *password_hash*."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def create_session(conn: sqlite3.Connection, user_id: int) -> str:
    """Create a new session row for *user_id* and return the opaque token."""
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    expires = now + SESSION_TTL_SECONDS
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now, expires),
    )
    return token


def delete_session(conn: sqlite3.Connection, token: str) -> None:
    """Remove the session row for *token* (no-op if it doesn't exist)."""
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def _lookup_session(conn: sqlite3.Connection, token: str) -> Optional[sqlite3.Row]:
    """Return the user row for a valid, unexpired *token*, or None."""
    now = int(time.time())
    return conn.execute(
        """
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ? AND sessions.expires_at > ?
        """,
        (token, now),
    ).fetchone()


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    """FastAPI dependency — return the authenticated user row or raise 401."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _lookup_session(conn, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user_id(user: sqlite3.Row = Depends(get_current_user)) -> int:
    """Convenience dependency — return just the authenticated user's id."""
    return user["id"]
