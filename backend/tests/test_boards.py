"""Tests for board CRUD endpoints and cross-user isolation."""


def test_list_boards_returns_default(client):
    r = client.get("/api/boards")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["title"] == "My Board"
    assert data[0]["card_count"] == 0


def test_list_boards_requires_auth(anon_client):
    r = anon_client.get("/api/boards")
    assert r.status_code == 401


def test_create_board(client):
    r = client.post("/api/boards", json={"title": "Sprint 42"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Sprint 42"
    assert data["position"] == 1  # first board was position 0
    assert data["card_count"] == 0


def test_create_board_initializes_default_columns(client):
    new_id = client.post("/api/boards", json={"title": "New"}).json()["id"]
    board = client.get(f"/api/boards/{new_id}").json()
    titles = [c["title"] for c in board["columns"]]
    assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def test_create_board_empty_title_rejected(client):
    r = client.post("/api/boards", json={"title": ""})
    assert r.status_code == 422


def test_list_boards_shows_multiple(client):
    client.post("/api/boards", json={"title": "Two"})
    client.post("/api/boards", json={"title": "Three"})
    data = client.get("/api/boards").json()
    assert len(data) == 3
    titles = [b["title"] for b in data]
    assert titles == ["My Board", "Two", "Three"]


def test_list_boards_card_count(client):
    col_id = int(client.get(f"/api/boards/{client.board_id}").json()["columns"][0]["id"])
    client.post(
        f"/api/boards/{client.board_id}/cards", json={"column_id": col_id, "title": "T"}
    )
    client.post(
        f"/api/boards/{client.board_id}/cards", json={"column_id": col_id, "title": "U"}
    )
    data = client.get("/api/boards").json()
    assert data[0]["card_count"] == 2


def test_rename_board(client):
    r = client.patch(f"/api/boards/{client.board_id}", json={"title": "Renamed"})
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed"


def test_rename_board_not_found(client):
    r = client.patch("/api/boards/99999", json={"title": "X"})
    assert r.status_code == 404


def test_rename_board_empty_title_rejected(client):
    r = client.patch(f"/api/boards/{client.board_id}", json={"title": ""})
    assert r.status_code == 422


def test_reorder_board_via_position(client):
    b2 = client.post("/api/boards", json={"title": "Two"}).json()
    r = client.patch(f"/api/boards/{b2['id']}", json={"position": 0})
    assert r.status_code == 200
    assert r.json()["position"] == 0


def test_delete_board(client):
    new_id = client.post("/api/boards", json={"title": "Throwaway"}).json()["id"]
    r = client.delete(f"/api/boards/{new_id}")
    assert r.status_code == 204
    boards = client.get("/api/boards").json()
    assert all(b["id"] != new_id for b in boards)


def test_delete_board_cascades_cards(client):
    new_id = client.post("/api/boards", json={"title": "Doomed"}).json()["id"]
    col_id = int(client.get(f"/api/boards/{new_id}").json()["columns"][0]["id"])
    client.post(
        f"/api/boards/{new_id}/cards", json={"column_id": col_id, "title": "T"}
    )
    client.delete(f"/api/boards/{new_id}")
    # Board gone
    assert client.get(f"/api/boards/{new_id}").status_code == 404


def test_cannot_delete_last_board(client):
    r = client.delete(f"/api/boards/{client.board_id}")
    assert r.status_code == 400


def test_delete_board_not_found(client):
    r = client.delete("/api/boards/99999")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Cross-user isolation
# ---------------------------------------------------------------------------

def test_users_see_only_their_own_boards(client, second_client):
    client.post("/api/boards", json={"title": "Alice extra"})
    alice_boards = client.get("/api/boards").json()
    bob_boards = second_client.get("/api/boards").json()
    assert len(alice_boards) == 2
    assert len(bob_boards) == 1
    assert all("Alice" not in b["title"] for b in bob_boards)


def test_user_cannot_rename_other_users_board(client, second_client):
    r = second_client.patch(
        f"/api/boards/{client.board_id}", json={"title": "Pwned"}
    )
    assert r.status_code == 404


def test_user_cannot_delete_other_users_board(client, second_client):
    r = second_client.delete(f"/api/boards/{client.board_id}")
    assert r.status_code == 404


def test_user_cannot_fetch_other_users_board(client, second_client):
    r = second_client.get(f"/api/boards/{client.board_id}")
    assert r.status_code == 404
