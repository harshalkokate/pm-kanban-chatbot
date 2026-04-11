import { clearSession, getToken } from "./auth";
import type { BoardData, Card, CardInput } from "./kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type BoardSummary = {
  id: number;
  title: string;
  position: number;
  card_count: number;
};

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    let detail = `API ${res.status}: ${path}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export async function listBoards(): Promise<BoardSummary[]> {
  return (await request("/boards")).json();
}

export async function createBoard(title: string): Promise<BoardSummary> {
  return (await request("/boards", { method: "POST", body: { title } })).json();
}

export async function renameBoard(
  boardId: number,
  title: string
): Promise<BoardSummary> {
  return (
    await request(`/boards/${boardId}`, { method: "PATCH", body: { title } })
  ).json();
}

export async function deleteBoard(boardId: number): Promise<void> {
  await request(`/boards/${boardId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Board contents
// ---------------------------------------------------------------------------

export async function fetchBoard(boardId: number): Promise<BoardData> {
  return (await request(`/boards/${boardId}`)).json();
}

export async function renameColumn(
  boardId: number,
  columnId: string,
  title: string
): Promise<void> {
  await request(`/boards/${boardId}/columns/${columnId}`, {
    method: "PATCH",
    body: { title },
  });
}

export async function addCard(
  boardId: number,
  columnId: string,
  input: CardInput
): Promise<Card> {
  return (
    await request(`/boards/${boardId}/cards`, {
      method: "POST",
      body: {
        column_id: parseInt(columnId),
        title: input.title,
        details: input.details ?? "",
        priority: input.priority ?? null,
        due_date: input.dueDate ?? null,
        assignee: input.assignee ?? null,
        labels: input.labels ?? [],
      },
    })
  ).json();
}

export type CardPatch = {
  title?: string;
  details?: string;
  priority?: string | null;
  dueDate?: string | null;
  assignee?: string | null;
  labels?: string[];
};

function applyNullable(
  body: Record<string, unknown>,
  value: string | null | undefined,
  setKey: string,
  clearKey: string
): void {
  if (value === null) body[clearKey] = true;
  else if (value !== undefined) body[setKey] = value;
}

export async function updateCard(
  boardId: number,
  cardId: string,
  patch: CardPatch
): Promise<Card> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.details !== undefined) body.details = patch.details;
  if (patch.labels !== undefined) body.labels = patch.labels;
  applyNullable(body, patch.priority, "priority", "clear_priority");
  applyNullable(body, patch.dueDate, "due_date", "clear_due_date");
  applyNullable(body, patch.assignee, "assignee", "clear_assignee");
  return (
    await request(`/boards/${boardId}/cards/${cardId}`, {
      method: "PATCH",
      body,
    })
  ).json();
}

export async function deleteCard(boardId: number, cardId: string): Promise<void> {
  await request(`/boards/${boardId}/cards/${cardId}`, { method: "DELETE" });
}

export async function moveCard(
  boardId: number,
  cardId: string,
  columnId: string,
  position: number
): Promise<void> {
  await request(`/boards/${boardId}/cards/${cardId}/move`, {
    method: "POST",
    body: { column_id: parseInt(columnId), position },
  });
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export async function aiChat(
  boardId: number,
  message: string,
  history: ChatMessage[]
): Promise<{ message: string; board: BoardData }> {
  return (
    await request(`/boards/${boardId}/ai/chat`, {
      method: "POST",
      body: { message, history },
    })
  ).json();
}
