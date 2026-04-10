"""Shared pytest fixtures.

Each test gets a fresh in-memory SQLite DB and a ``TestClient`` that is
pre-authenticated as a freshly registered user. The client's default
``Authorization`` header is set to that user's token, and the user's default
board id is exposed via ``client.board_id`` for convenience.

A second, unauthenticated client is available via ``anon_client`` for tests
that need to exercise the login/register endpoints directly.
"""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from database import create_tables, get_db
from main import app


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    create_tables(c)

    def override_db():
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise

    app.dependency_overrides[get_db] = override_db
    yield c
    app.dependency_overrides.clear()
    c.close()


@pytest.fixture
def anon_client(conn):
    """Unauthenticated TestClient (no default Authorization header)."""
    with TestClient(app) as c:
        yield c


def _register(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/auth/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def client(conn):
    """Authenticated TestClient. Registers 'alice' and stores her token/board.

    Attributes on the returned client:
        client.token   – the session bearer token
        client.user_id – alice's user id
        client.board_id – id of alice's default board (created at registration)
    """
    with TestClient(app) as c:
        data = _register(c, "alice", "password123")
        c.headers.update({"Authorization": f"Bearer {data['token']}"})
        c.token = data["token"]
        c.user_id = data["user"]["id"]
        boards = c.get("/api/boards").json()
        c.board_id = boards[0]["id"]
        yield c


@pytest.fixture
def second_client(conn, client):
    """A second, independently authenticated TestClient (user 'bob').

    Depends on ``client`` so both users share the same in-memory DB. Useful
    for ownership-isolation tests.
    """
    with TestClient(app) as c:
        data = _register(c, "bob", "password123")
        c.headers.update({"Authorization": f"Bearer {data['token']}"})
        c.token = data["token"]
        c.user_id = data["user"]["id"]
        boards = c.get("/api/boards").json()
        c.board_id = boards[0]["id"]
        yield c
