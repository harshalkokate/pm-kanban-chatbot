import * as api from "@/lib/api";
import { setToken } from "@/lib/auth";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api client", () => {
  it("attaches bearer token to authenticated requests", async () => {
    setToken("mytoken");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(okJson([]));
    await api.listBoards();
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mytoken");
  });

  it("listBoards hits /api/boards", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(okJson([]));
    await api.listBoards();
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards");
  });

  it("createBoard posts to /api/boards", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ id: 1, title: "T", position: 0, card_count: 0 }, 201)
    );
    await api.createBoard("New board");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards");
    expect(mockFetch.mock.calls[0][1]?.method).toBe("POST");
    expect(mockFetch.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ title: "New board" })
    );
  });

  it("fetchBoard uses board-scoped URL", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ id: 7, title: "X", columns: [], cards: {} })
    );
    await api.fetchBoard(7);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards/7");
  });

  it("addCard includes card metadata in body", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({
        id: "1",
        title: "T",
        details: "",
        priority: "high",
        due_date: null,
        assignee: null,
        labels: [],
      }, 201)
    );
    await api.addCard(3, "12", {
      title: "T",
      details: "",
      priority: "high",
      labels: ["a"],
    });
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards/3/cards");
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.column_id).toBe(12);
    expect(body.priority).toBe("high");
    expect(body.labels).toEqual(["a"]);
  });

  it("updateCard maps null priority to clear_priority", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ id: "1", title: "T", details: "", labels: [] })
    );
    await api.updateCard(2, "5", { priority: null, title: "x" });
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.clear_priority).toBe(true);
    expect(body.title).toBe("x");
    expect("priority" in body).toBe(false);
  });

  it("updateCard includes labels array", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ id: "1", title: "T", details: "", labels: ["a"] })
    );
    await api.updateCard(2, "5", { labels: ["a", "b"] });
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.labels).toEqual(["a", "b"]);
  });

  it("moveCard hits the right URL", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ ok: true })
    );
    await api.moveCard(4, "9", "10", 2);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards/4/cards/9/move");
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ column_id: 10, position: 2 });
  });

  it("aiChat includes board id in URL", async () => {
    setToken("t");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ message: "hi", board: { id: 1, title: "t", columns: [], cards: {} } })
    );
    await api.aiChat(11, "hello", []);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/boards/11/ai/chat");
  });

  it("throws ApiError on non-2xx responses", async () => {
    setToken("t");
    vi.spyOn(global, "fetch").mockResolvedValue(
      okJson({ detail: "Board not found" }, 404)
    );
    await expect(api.fetchBoard(1)).rejects.toThrow("Board not found");
  });

  it("clears session on 401", async () => {
    setToken("t");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("", { status: 401 })
    );
    await expect(api.fetchBoard(1)).rejects.toThrow();
    expect(localStorage.getItem("pm_token")).toBeNull();
  });
});
