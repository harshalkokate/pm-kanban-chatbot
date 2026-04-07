import pytest


# ---------------------------------------------------------------------------
# GET /api/board
# ---------------------------------------------------------------------------

def test_get_board_structure(client):
    r = client.get("/api/board")
    assert r.status_code == 200
    data = r.json()
    assert "columns" in data
    assert "cards" in data


def test_get_board_has_five_columns(client):
    data = client.get("/api/board").json()
    assert len(data["columns"]) == 5


def test_get_board_column_titles(client):
    data = client.get("/api/board").json()
    titles = [c["title"] for c in data["columns"]]
    assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def test_get_board_columns_have_cardIds(client):
    data = client.get("/api/board").json()
    for col in data["columns"]:
        assert "id" in col
        assert "title" in col
        assert "cardIds" in col


def test_get_board_cards_is_empty_on_seed(client):
    data = client.get("/api/board").json()
    assert data["cards"] == {}


# ---------------------------------------------------------------------------
# PATCH /api/columns/{id}
# ---------------------------------------------------------------------------

def test_rename_column(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.patch(f"/api/columns/{col_id}", json={"title": "New Name"})
    assert r.status_code == 200
    data = client.get("/api/board").json()
    assert data["columns"][0]["title"] == "New Name"


def test_rename_column_not_found(client):
    r = client.patch("/api/columns/9999", json={"title": "X"})
    assert r.status_code == 404


def test_rename_column_missing_title(client):
    col_id = client.get("/api/board").json()["columns"][0]["id"]
    r = client.patch(f"/api/columns/{col_id}", json={})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/cards
# ---------------------------------------------------------------------------

def _first_column_id(client) -> int:
    return int(client.get("/api/board").json()["columns"][0]["id"])


def test_add_card(client):
    col_id = _first_column_id(client)
    r = client.post("/api/cards", json={"column_id": col_id, "title": "My Task", "details": "Notes"})
    assert r.status_code == 201
    card = r.json()
    assert card["title"] == "My Task"
    assert card["details"] == "Notes"
    assert "id" in card


def test_add_card_appears_in_board(client):
    col_id = _first_column_id(client)
    card_id = client.post("/api/cards", json={"column_id": col_id, "title": "T1", "details": ""}).json()["id"]
    data = client.get("/api/board").json()
    col = next(c for c in data["columns"] if c["id"] == str(col_id))
    assert card_id in col["cardIds"]
    assert card_id in data["cards"]


def test_add_card_default_details(client):
    col_id = _first_column_id(client)
    card = client.post("/api/cards", json={"column_id": col_id, "title": "No details"}).json()
    assert card["details"] == ""


def test_add_card_invalid_column(client):
    r = client.post("/api/cards", json={"column_id": 9999, "title": "X"})
    assert r.status_code == 404


def test_add_card_missing_title(client):
    col_id = _first_column_id(client)
    r = client.post("/api/cards", json={"column_id": col_id})
    assert r.status_code == 422


def test_add_multiple_cards_ordered(client):
    col_id = _first_column_id(client)
    ids = []
    for i in range(3):
        ids.append(client.post("/api/cards", json={"column_id": col_id, "title": f"T{i}"}).json()["id"])
    col = next(c for c in client.get("/api/board").json()["columns"] if c["id"] == str(col_id))
    assert col["cardIds"] == ids


# ---------------------------------------------------------------------------
# PATCH /api/cards/{id}
# ---------------------------------------------------------------------------

def test_update_card(client):
    col_id = _first_column_id(client)
    card_id = client.post("/api/cards", json={"column_id": col_id, "title": "Old", "details": "Old details"}).json()["id"]
    r = client.patch(f"/api/cards/{card_id}", json={"title": "New", "details": "New details"})
    assert r.status_code == 200
    assert r.json()["title"] == "New"
    assert r.json()["details"] == "New details"


def test_update_card_reflected_in_board(client):
    col_id = _first_column_id(client)
    card_id = client.post("/api/cards", json={"column_id": col_id, "title": "Old"}).json()["id"]
    client.patch(f"/api/cards/{card_id}", json={"title": "New", "details": ""})
    assert client.get("/api/board").json()["cards"][card_id]["title"] == "New"


def test_update_card_not_found(client):
    r = client.patch("/api/cards/9999", json={"title": "X", "details": ""})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/cards/{id}
# ---------------------------------------------------------------------------

def test_delete_card(client):
    col_id = _first_column_id(client)
    card_id = client.post("/api/cards", json={"column_id": col_id, "title": "Del me"}).json()["id"]
    r = client.delete(f"/api/cards/{card_id}")
    assert r.status_code == 204
    data = client.get("/api/board").json()
    assert card_id not in data["cards"]
    col = next(c for c in data["columns"] if c["id"] == str(col_id))
    assert card_id not in col["cardIds"]


def test_delete_card_renormalizes_positions(client):
    col_id = _first_column_id(client)
    ids = [client.post("/api/cards", json={"column_id": col_id, "title": f"T{i}"}).json()["id"] for i in range(3)]
    client.delete(f"/api/cards/{ids[1]}")  # remove middle card
    col = next(c for c in client.get("/api/board").json()["columns"] if c["id"] == str(col_id))
    assert col["cardIds"] == [ids[0], ids[2]]


def test_delete_card_not_found(client):
    r = client.delete("/api/cards/9999")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/cards/{id}/move
# ---------------------------------------------------------------------------

def _add(client, col_id, title) -> str:
    return client.post("/api/cards", json={"column_id": col_id, "title": title}).json()["id"]


def test_move_card_within_same_column(client):
    cols = client.get("/api/board").json()["columns"]
    col_id = int(cols[0]["id"])
    a = _add(client, col_id, "A")
    b = _add(client, col_id, "B")
    c = _add(client, col_id, "C")
    # Move A (position 0) to position 2 (end)
    r = client.post(f"/api/cards/{a}/move", json={"column_id": col_id, "position": 2})
    assert r.status_code == 200
    col = next(x for x in client.get("/api/board").json()["columns"] if x["id"] == str(col_id))
    assert col["cardIds"] == [b, c, a]


def test_move_card_to_different_column(client):
    cols = client.get("/api/board").json()["columns"]
    src_id = int(cols[0]["id"])
    dst_id = int(cols[1]["id"])
    a = _add(client, src_id, "A")
    b = _add(client, dst_id, "B")
    r = client.post(f"/api/cards/{a}/move", json={"column_id": dst_id, "position": 0})
    assert r.status_code == 200
    data = client.get("/api/board").json()
    src_col = next(x for x in data["columns"] if x["id"] == str(src_id))
    dst_col = next(x for x in data["columns"] if x["id"] == str(dst_id))
    assert a not in src_col["cardIds"]
    assert dst_col["cardIds"][0] == a
    assert b in dst_col["cardIds"]


def test_move_card_to_end_of_column(client):
    cols = client.get("/api/board").json()["columns"]
    src_id = int(cols[0]["id"])
    dst_id = int(cols[1]["id"])
    a = _add(client, src_id, "A")
    b = _add(client, dst_id, "B")
    c = _add(client, dst_id, "C")
    client.post(f"/api/cards/{a}/move", json={"column_id": dst_id, "position": 999})
    dst_col = next(x for x in client.get("/api/board").json()["columns"] if x["id"] == str(dst_id))
    assert dst_col["cardIds"][-1] == a


def test_move_card_not_found(client):
    col_id = _first_column_id(client)
    r = client.post("/api/cards/9999/move", json={"column_id": col_id, "position": 0})
    assert r.status_code == 404


def test_move_card_invalid_target_column(client):
    col_id = _first_column_id(client)
    card_id = _add(client, col_id, "X")
    r = client.post(f"/api/cards/{card_id}/move", json={"column_id": 9999, "position": 0})
    assert r.status_code == 404
