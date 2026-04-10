"""CRUD tests for columns and cards under /api/boards/{board_id}/..."""


def _board_url(client) -> str:
    return f"/api/boards/{client.board_id}"


def _get_board(client):
    return client.get(_board_url(client)).json()


def _first_column_id(client) -> int:
    return int(_get_board(client)["columns"][0]["id"])


# ---------------------------------------------------------------------------
# GET /api/boards/{id}
# ---------------------------------------------------------------------------

def test_get_board_structure(client):
    r = client.get(_board_url(client))
    assert r.status_code == 200
    data = r.json()
    assert "columns" in data
    assert "cards" in data
    assert data["id"] == client.board_id


def test_get_board_has_five_columns(client):
    data = _get_board(client)
    assert len(data["columns"]) == 5


def test_get_board_column_titles(client):
    data = _get_board(client)
    titles = [c["title"] for c in data["columns"]]
    assert titles == ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def test_get_board_columns_have_cardIds(client):
    data = _get_board(client)
    for col in data["columns"]:
        assert "id" in col
        assert "title" in col
        assert "cardIds" in col


def test_get_board_cards_is_empty_on_fresh_user(client):
    data = _get_board(client)
    assert data["cards"] == {}


def test_get_board_requires_auth(anon_client):
    r = anon_client.get("/api/boards/1")
    assert r.status_code == 401


def test_get_board_not_found_for_other_user(client, second_client):
    r = second_client.get(f"/api/boards/{client.board_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/boards/{id}/columns/{column_id}
# ---------------------------------------------------------------------------

def test_rename_column(client):
    col_id = _first_column_id(client)
    r = client.patch(f"{_board_url(client)}/columns/{col_id}", json={"title": "New Name"})
    assert r.status_code == 200
    assert _get_board(client)["columns"][0]["title"] == "New Name"


def test_rename_column_not_found(client):
    r = client.patch(f"{_board_url(client)}/columns/9999", json={"title": "X"})
    assert r.status_code == 404


def test_rename_column_missing_title(client):
    col_id = _first_column_id(client)
    r = client.patch(f"{_board_url(client)}/columns/{col_id}", json={})
    assert r.status_code == 422


def test_rename_column_empty_title_rejected(client):
    col_id = _first_column_id(client)
    r = client.patch(f"{_board_url(client)}/columns/{col_id}", json={"title": ""})
    assert r.status_code == 422


def test_rename_column_requires_ownership(client, second_client):
    col_id = _first_column_id(client)
    r = second_client.patch(
        f"/api/boards/{client.board_id}/columns/{col_id}", json={"title": "Hacked"}
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/boards/{id}/cards
# ---------------------------------------------------------------------------

def test_add_card(client):
    col_id = _first_column_id(client)
    r = client.post(
        f"{_board_url(client)}/cards",
        json={"column_id": col_id, "title": "My Task", "details": "Notes"},
    )
    assert r.status_code == 201
    card = r.json()
    assert card["title"] == "My Task"
    assert card["details"] == "Notes"
    assert "id" in card
    assert card["labels"] == []
    assert card["priority"] is None


def test_add_card_appears_in_board(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "T1"}
    ).json()["id"]
    data = _get_board(client)
    col = next(c for c in data["columns"] if c["id"] == str(col_id))
    assert card_id in col["cardIds"]
    assert card_id in data["cards"]


def test_add_card_default_details(client):
    col_id = _first_column_id(client)
    card = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "No details"}
    ).json()
    assert card["details"] == ""


def test_add_card_invalid_column(client):
    r = client.post(f"{_board_url(client)}/cards", json={"column_id": 9999, "title": "X"})
    assert r.status_code == 404


def test_add_card_missing_title(client):
    col_id = _first_column_id(client)
    r = client.post(f"{_board_url(client)}/cards", json={"column_id": col_id})
    assert r.status_code == 422


def test_add_multiple_cards_ordered(client):
    col_id = _first_column_id(client)
    ids = [
        client.post(
            f"{_board_url(client)}/cards", json={"column_id": col_id, "title": f"T{i}"}
        ).json()["id"]
        for i in range(3)
    ]
    col = next(c for c in _get_board(client)["columns"] if c["id"] == str(col_id))
    assert col["cardIds"] == ids


def test_add_card_with_metadata(client):
    col_id = _first_column_id(client)
    r = client.post(
        f"{_board_url(client)}/cards",
        json={
            "column_id": col_id,
            "title": "With metadata",
            "details": "",
            "priority": "high",
            "due_date": "2026-05-01",
            "assignee": "alice",
            "labels": ["frontend", "urgent"],
        },
    )
    assert r.status_code == 201
    card = r.json()
    assert card["priority"] == "high"
    assert card["due_date"] == "2026-05-01"
    assert card["assignee"] == "alice"
    assert set(card["labels"]) == {"frontend", "urgent"}


def test_add_card_invalid_priority_rejected(client):
    col_id = _first_column_id(client)
    r = client.post(
        f"{_board_url(client)}/cards",
        json={"column_id": col_id, "title": "T", "priority": "bogus"},
    )
    assert r.status_code == 422


def test_add_card_cannot_target_other_users_column(client, second_client):
    other_col = _first_column_id(client)
    r = second_client.post(
        f"/api/boards/{second_client.board_id}/cards",
        json={"column_id": other_col, "title": "IDOR"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/boards/{id}/cards/{card_id}
# ---------------------------------------------------------------------------

def test_update_card(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards",
        json={"column_id": col_id, "title": "Old", "details": "Old details"},
    ).json()["id"]
    r = client.patch(
        f"{_board_url(client)}/cards/{card_id}",
        json={"title": "New", "details": "New details"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "New"
    assert r.json()["details"] == "New details"


def test_update_card_reflected_in_board(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "Old"}
    ).json()["id"]
    client.patch(f"{_board_url(client)}/cards/{card_id}", json={"title": "New", "details": ""})
    assert _get_board(client)["cards"][card_id]["title"] == "New"


def test_update_card_not_found(client):
    r = client.patch(
        f"{_board_url(client)}/cards/9999", json={"title": "X", "details": ""}
    )
    assert r.status_code == 404


def test_update_card_priority_and_labels(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "T"}
    ).json()["id"]
    r = client.patch(
        f"{_board_url(client)}/cards/{card_id}",
        json={"priority": "urgent", "labels": ["bug", "p0"]},
    )
    assert r.status_code == 200
    card = r.json()
    assert card["priority"] == "urgent"
    assert set(card["labels"]) == {"bug", "p0"}


def test_update_card_clear_priority(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards",
        json={"column_id": col_id, "title": "T", "priority": "high"},
    ).json()["id"]
    r = client.patch(
        f"{_board_url(client)}/cards/{card_id}", json={"clear_priority": True}
    )
    assert r.status_code == 200
    assert r.json()["priority"] is None


def test_update_card_clear_due_date(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards",
        json={"column_id": col_id, "title": "T", "due_date": "2026-05-01"},
    ).json()["id"]
    r = client.patch(
        f"{_board_url(client)}/cards/{card_id}", json={"clear_due_date": True}
    )
    assert r.json()["due_date"] is None


def test_update_card_invalid_priority(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "T"}
    ).json()["id"]
    r = client.patch(
        f"{_board_url(client)}/cards/{card_id}", json={"priority": "bogus"}
    )
    assert r.status_code == 422


def test_update_card_requires_ownership(client, second_client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "Mine"}
    ).json()["id"]
    r = second_client.patch(
        f"/api/boards/{client.board_id}/cards/{card_id}", json={"title": "Hacked"}
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/boards/{id}/cards/{card_id}
# ---------------------------------------------------------------------------

def test_delete_card(client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "Del me"}
    ).json()["id"]
    r = client.delete(f"{_board_url(client)}/cards/{card_id}")
    assert r.status_code == 204
    data = _get_board(client)
    assert card_id not in data["cards"]
    col = next(c for c in data["columns"] if c["id"] == str(col_id))
    assert card_id not in col["cardIds"]


def test_delete_card_renormalizes_positions(client):
    col_id = _first_column_id(client)
    ids = [
        client.post(
            f"{_board_url(client)}/cards", json={"column_id": col_id, "title": f"T{i}"}
        ).json()["id"]
        for i in range(3)
    ]
    client.delete(f"{_board_url(client)}/cards/{ids[1]}")
    col = next(c for c in _get_board(client)["columns"] if c["id"] == str(col_id))
    assert col["cardIds"] == [ids[0], ids[2]]


def test_delete_card_not_found(client):
    r = client.delete(f"{_board_url(client)}/cards/9999")
    assert r.status_code == 404


def test_delete_card_requires_ownership(client, second_client):
    col_id = _first_column_id(client)
    card_id = client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": "Mine"}
    ).json()["id"]
    r = second_client.delete(f"/api/boards/{client.board_id}/cards/{card_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/boards/{id}/cards/{card_id}/move
# ---------------------------------------------------------------------------

def _add(client, col_id, title) -> str:
    return client.post(
        f"{_board_url(client)}/cards", json={"column_id": col_id, "title": title}
    ).json()["id"]


def test_move_card_within_same_column(client):
    col_id = _first_column_id(client)
    a = _add(client, col_id, "A")
    b = _add(client, col_id, "B")
    c = _add(client, col_id, "C")
    r = client.post(
        f"{_board_url(client)}/cards/{a}/move", json={"column_id": col_id, "position": 2}
    )
    assert r.status_code == 200
    col = next(x for x in _get_board(client)["columns"] if x["id"] == str(col_id))
    assert col["cardIds"] == [b, c, a]


def test_move_card_to_different_column(client):
    cols = _get_board(client)["columns"]
    src_id = int(cols[0]["id"])
    dst_id = int(cols[1]["id"])
    a = _add(client, src_id, "A")
    b = _add(client, dst_id, "B")
    r = client.post(
        f"{_board_url(client)}/cards/{a}/move", json={"column_id": dst_id, "position": 0}
    )
    assert r.status_code == 200
    data = _get_board(client)
    src_col = next(x for x in data["columns"] if x["id"] == str(src_id))
    dst_col = next(x for x in data["columns"] if x["id"] == str(dst_id))
    assert a not in src_col["cardIds"]
    assert dst_col["cardIds"][0] == a
    assert b in dst_col["cardIds"]


def test_move_card_to_end_of_column(client):
    cols = _get_board(client)["columns"]
    src_id = int(cols[0]["id"])
    dst_id = int(cols[1]["id"])
    a = _add(client, src_id, "A")
    _add(client, dst_id, "B")
    _add(client, dst_id, "C")
    client.post(
        f"{_board_url(client)}/cards/{a}/move", json={"column_id": dst_id, "position": 999}
    )
    dst_col = next(x for x in _get_board(client)["columns"] if x["id"] == str(dst_id))
    assert dst_col["cardIds"][-1] == a


def test_move_card_not_found(client):
    col_id = _first_column_id(client)
    r = client.post(
        f"{_board_url(client)}/cards/9999/move", json={"column_id": col_id, "position": 0}
    )
    assert r.status_code == 404


def test_move_card_invalid_target_column(client):
    col_id = _first_column_id(client)
    card_id = _add(client, col_id, "X")
    r = client.post(
        f"{_board_url(client)}/cards/{card_id}/move", json={"column_id": 9999, "position": 0}
    )
    assert r.status_code == 404


def test_move_card_cannot_target_other_users_column(client, second_client):
    other_col = _first_column_id(client)
    my_col = _first_column_id(second_client)
    card_id = _add(second_client, my_col, "Mine")
    r = second_client.post(
        f"{_board_url(second_client)}/cards/{card_id}/move",
        json={"column_id": other_col, "position": 0},
    )
    assert r.status_code == 404
