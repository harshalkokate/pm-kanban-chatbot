import sqlite3

import pytest
from fastapi.testclient import TestClient

from database import create_tables, get_db, seed
from main import app


@pytest.fixture
def client():
    """TestClient backed by a fresh in-memory SQLite database."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    create_tables(conn)
    seed(conn)

    def override_db():
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    conn.close()
