"""Tests for /api/auth/{register,login,logout,me}."""


def test_register_creates_user_and_returns_token(anon_client):
    r = anon_client.post(
        "/api/auth/register", json={"username": "newuser", "password": "hunter2!"}
    )
    assert r.status_code == 201
    data = r.json()
    assert "token" in data and data["token"]
    assert data["user"]["username"] == "newuser"
    assert isinstance(data["user"]["id"], int)


def test_register_creates_default_board(anon_client):
    r = anon_client.post(
        "/api/auth/register", json={"username": "alice2", "password": "hunter22"}
    )
    token = r.json()["token"]
    boards = anon_client.get(
        "/api/boards", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert len(boards) == 1
    assert boards[0]["title"] == "My Board"


def test_register_duplicate_username_rejected(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "dup", "password": "hunter22"}
    )
    r = anon_client.post(
        "/api/auth/register", json={"username": "dup", "password": "hunter22"}
    )
    assert r.status_code == 409


def test_register_rejects_short_password(anon_client):
    r = anon_client.post(
        "/api/auth/register", json={"username": "short", "password": "abc"}
    )
    assert r.status_code == 422


def test_register_rejects_short_username(anon_client):
    r = anon_client.post(
        "/api/auth/register", json={"username": "ab", "password": "password1"}
    )
    assert r.status_code == 422


def test_login_with_valid_credentials(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "loginme", "password": "hunter22"}
    )
    r = anon_client.post(
        "/api/auth/login", json={"username": "loginme", "password": "hunter22"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "loginme"
    assert r.json()["token"]


def test_login_wrong_password(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "wp", "password": "hunter22"}
    )
    r = anon_client.post(
        "/api/auth/login", json={"username": "wp", "password": "nope"}
    )
    assert r.status_code == 401


def test_login_unknown_user(anon_client):
    r = anon_client.post(
        "/api/auth/login", json={"username": "ghost", "password": "hunter22"}
    )
    assert r.status_code == 401


def test_me_requires_auth(anon_client):
    r = anon_client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_returns_current_user(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "alice"


def test_logout_invalidates_token(client):
    r = client.post("/api/auth/logout")
    assert r.status_code == 204
    r2 = client.get("/api/auth/me")
    assert r2.status_code == 401


def test_logout_requires_auth(anon_client):
    r = anon_client.post("/api/auth/logout")
    assert r.status_code == 401


def test_two_logins_get_distinct_tokens(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "multi", "password": "hunter22"}
    )
    t1 = anon_client.post(
        "/api/auth/login", json={"username": "multi", "password": "hunter22"}
    ).json()["token"]
    t2 = anon_client.post(
        "/api/auth/login", json={"username": "multi", "password": "hunter22"}
    ).json()["token"]
    assert t1 != t2
    # Both tokens remain valid
    assert (
        anon_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {t1}"}
        ).status_code
        == 200
    )
    assert (
        anon_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {t2}"}
        ).status_code
        == 200
    )


def test_invalid_token_rejected(anon_client):
    r = anon_client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert r.status_code == 401


def test_malformed_authorization_header_rejected(anon_client):
    r = anon_client.get(
        "/api/auth/me", headers={"Authorization": "not-bearer-format"}
    )
    assert r.status_code == 401


def test_password_is_hashed_not_stored_plain(anon_client, conn):
    anon_client.post(
        "/api/auth/register", json={"username": "hashcheck", "password": "plaintext1"}
    )
    row = conn.execute(
        "SELECT password_hash FROM users WHERE username = ?", ("hashcheck",)
    ).fetchone()
    assert row["password_hash"] != "plaintext1"
    assert row["password_hash"].startswith("$2")  # bcrypt prefix
