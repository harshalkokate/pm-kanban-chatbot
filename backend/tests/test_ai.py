import json
from unittest.mock import MagicMock, patch

from ai import AIResponse, BoardUpdate, CardAdd, CardDelete, CardMove, ColumnRename


def _mock_chat_response(content: str) -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = content
    return response


def _ai_resp(message: str, **update_kwargs) -> AIResponse:
    return AIResponse(message=message, board_update=BoardUpdate(**update_kwargs))


# ---------------------------------------------------------------------------
# Unit tests: ai.chat
# ---------------------------------------------------------------------------

def test_chat_calls_correct_model():
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response("4")
        from ai import chat, MODEL
        chat([{"role": "user", "content": "2+2?"}])
        assert mock.call_args.kwargs["model"] == MODEL


def test_chat_returns_content():
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response("Hello")
        from ai import chat
        assert chat([{"role": "user", "content": "hi"}]) == "Hello"


def test_chat_passes_all_messages():
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response("ok")
        from ai import chat
        msgs = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
        chat(msgs)
        assert mock.call_args.kwargs["messages"] == msgs


# ---------------------------------------------------------------------------
# Unit tests: ai.chat_structured
# ---------------------------------------------------------------------------

def test_chat_structured_parses_response():
    payload = json.dumps({"message": "Done", "board_update": {"add_cards": [], "move_cards": [], "delete_cards": [], "rename_columns": []}})
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response(payload)
        from ai import chat_structured
        result = chat_structured([{"role": "user", "content": "hi"}])
    assert result.message == "Done"
    assert result.board_update.add_cards == []


def test_chat_structured_parses_add_cards():
    payload = json.dumps({
        "message": "Added",
        "board_update": {
            "add_cards": [{"column_id": 1, "title": "New Task", "details": ""}],
            "move_cards": [], "delete_cards": [], "rename_columns": [],
        }
    })
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response(payload)
        from ai import chat_structured
        result = chat_structured([])
    assert len(result.board_update.add_cards) == 1
    assert result.board_update.add_cards[0].title == "New Task"


def test_chat_structured_uses_json_object_format():
    with patch("ai.openai_client.chat.completions.create") as mock:
        mock.return_value = _mock_chat_response(json.dumps({"message": "ok", "board_update": {"add_cards": [], "move_cards": [], "delete_cards": [], "rename_columns": []}}))
        from ai import chat_structured
        chat_structured([])
        assert mock.call_args.kwargs["response_format"] == {"type": "json_object"}


# ---------------------------------------------------------------------------
# Unit tests: ai.build_system_prompt
# ---------------------------------------------------------------------------

def test_build_system_prompt_includes_board():
    from ai import build_system_prompt
    board = {"columns": [{"id": 1, "title": "Backlog", "cards": []}]}
    prompt = build_system_prompt(board)
    assert "Backlog" in prompt
    assert '"id": 1' in prompt


def test_build_system_prompt_explains_format():
    from ai import build_system_prompt
    prompt = build_system_prompt({"columns": []})
    assert "board_update" in prompt
    assert "add_cards" in prompt
    assert "move_cards" in prompt


# ---------------------------------------------------------------------------
# API endpoint: GET /api/ai/test
# ---------------------------------------------------------------------------

def test_ai_test_endpoint(client):
    with patch("main.chat", return_value="4"):
        r = client.get("/api/ai/test")
    assert r.status_code == 200
    assert r.json()["result"] == "4"


# ---------------------------------------------------------------------------
# API endpoint: POST /api/ai/chat
# ---------------------------------------------------------------------------

def test_ai_chat_no_board_changes(client):
    with patch("main.chat_structured", return_value=_ai_resp("Hello!")):
        r = client.post("/api/ai/chat", json={"message": "hi", "history": []})
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "Hello!"
    assert "board" in data
    assert len(data["board"]["columns"]) == 5


def test_ai_chat_adds_card(client):
    col_id = int(client.get("/api/board").json()["columns"][0]["id"])
    response = _ai_resp("Added a card", add_cards=[CardAdd(column_id=col_id, title="AI Task", details="From AI")])
    with patch("main.chat_structured", return_value=response):
        r = client.post("/api/ai/chat", json={"message": "add a task", "history": []})
    assert r.status_code == 200
    board = r.json()["board"]
    titles = [c["title"] for c in board["cards"].values()]
    assert "AI Task" in titles


def test_ai_chat_adds_card_to_correct_column(client):
    cols = client.get("/api/board").json()["columns"]
    target_col_id = int(cols[2]["id"])  # In Progress
    response = _ai_resp("Added", add_cards=[CardAdd(column_id=target_col_id, title="In-Progress Task", details="")])
    with patch("main.chat_structured", return_value=response):
        client.post("/api/ai/chat", json={"message": "add task", "history": []})
    board = client.get("/api/board").json()
    target_col = next(c for c in board["columns"] if c["id"] == str(target_col_id))
    card_titles = [board["cards"][cid]["title"] for cid in target_col["cardIds"]]
    assert "In-Progress Task" in card_titles


def test_ai_chat_deletes_card(client):
    # First add a card via the normal API
    col_id = int(client.get("/api/board").json()["columns"][0]["id"])
    card_id = int(client.post("/api/cards", json={"column_id": col_id, "title": "To Delete"}).json()["id"])

    response = _ai_resp("Deleted", delete_cards=[CardDelete(card_id=card_id)])
    with patch("main.chat_structured", return_value=response):
        r = client.post("/api/ai/chat", json={"message": "delete it", "history": []})
    assert r.status_code == 200
    board = r.json()["board"]
    assert str(card_id) not in board["cards"]


def test_ai_chat_moves_card(client):
    cols = client.get("/api/board").json()["columns"]
    src_col_id = int(cols[0]["id"])
    dst_col_id = int(cols[1]["id"])
    card_id = int(client.post("/api/cards", json={"column_id": src_col_id, "title": "Movable"}).json()["id"])

    response = _ai_resp("Moved", move_cards=[CardMove(card_id=card_id, column_id=dst_col_id, position=0)])
    with patch("main.chat_structured", return_value=response):
        r = client.post("/api/ai/chat", json={"message": "move it", "history": []})
    assert r.status_code == 200
    board = r.json()["board"]
    dst_col = next(c for c in board["columns"] if c["id"] == str(dst_col_id))
    assert str(card_id) in dst_col["cardIds"]


def test_ai_chat_renames_column(client):
    col_id = int(client.get("/api/board").json()["columns"][0]["id"])
    response = _ai_resp("Renamed", rename_columns=[ColumnRename(column_id=col_id, title="Sprint")])
    with patch("main.chat_structured", return_value=response):
        r = client.post("/api/ai/chat", json={"message": "rename it", "history": []})
    assert r.status_code == 200
    board = r.json()["board"]
    titles = [c["title"] for c in board["columns"]]
    assert "Sprint" in titles


def test_ai_chat_applies_multiple_actions(client):
    cols = client.get("/api/board").json()["columns"]
    col1_id = int(cols[0]["id"])
    col2_id = int(cols[1]["id"])
    response = _ai_resp(
        "Done",
        add_cards=[
            CardAdd(column_id=col1_id, title="Card A", details=""),
            CardAdd(column_id=col2_id, title="Card B", details="notes"),
        ],
        rename_columns=[ColumnRename(column_id=col1_id, title="Now")],
    )
    with patch("main.chat_structured", return_value=response):
        r = client.post("/api/ai/chat", json={"message": "do stuff", "history": []})
    assert r.status_code == 200
    board = r.json()["board"]
    titles = [c["title"] for c in board["cards"].values()]
    assert "Card A" in titles
    assert "Card B" in titles
    col_titles = [c["title"] for c in board["columns"]]
    assert "Now" in col_titles


def test_ai_chat_passes_history_to_model(client):
    history = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
    ]
    with patch("main.chat_structured") as mock_cs:
        mock_cs.return_value = _ai_resp("ok")
        client.post("/api/ai/chat", json={"message": "follow up", "history": history})
    messages = mock_cs.call_args[0][0]
    roles = [m["role"] for m in messages]
    assert roles[0] == "system"
    assert {"role": "user", "content": "hello"} in messages
    assert {"role": "assistant", "content": "hi there"} in messages
    assert messages[-1] == {"role": "user", "content": "follow up"}


def test_ai_chat_board_in_system_prompt(client):
    with patch("main.chat_structured") as mock_cs:
        mock_cs.return_value = _ai_resp("ok")
        client.post("/api/ai/chat", json={"message": "hi", "history": []})
    system_msg = mock_cs.call_args[0][0][0]
    assert system_msg["role"] == "system"
    assert "Backlog" in system_msg["content"]
