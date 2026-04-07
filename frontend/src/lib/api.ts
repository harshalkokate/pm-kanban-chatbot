import type { BoardData, Card } from "./kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const BASE = "/api";

async function request(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchBoard(): Promise<BoardData> {
  return (await request("/board")).json();
}

export async function renameColumn(id: string, title: string): Promise<void> {
  await request(`/columns/${id}`, { method: "PATCH", ...json({ title }) });
}

export async function addCard(
  columnId: string,
  title: string,
  details: string
): Promise<Card> {
  return (
    await request("/cards", {
      method: "POST",
      ...json({ column_id: parseInt(columnId), title, details }),
    })
  ).json();
}

export async function deleteCard(id: string): Promise<void> {
  await request(`/cards/${id}`, { method: "DELETE" });
}

export async function aiChat(
  message: string,
  history: ChatMessage[]
): Promise<{ message: string; board: BoardData }> {
  return (
    await request("/ai/chat", {
      method: "POST",
      ...json({ message, history }),
    })
  ).json();
}

export async function moveCard(
  id: string,
  columnId: string,
  position: number
): Promise<void> {
  await request(`/cards/${id}/move`, {
    method: "POST",
    ...json({ column_id: parseInt(columnId), position }),
  });
}
