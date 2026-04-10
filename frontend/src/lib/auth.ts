/**
 * Auth storage and helpers backed by the real backend.
 *
 * The session token returned by /api/auth/login (or /register) is stored in
 * localStorage under SESSION_KEY. `getToken()` is read by the API client to
 * attach the Authorization header; `getUser()` exposes the cached user row.
 */
const SESSION_KEY = "pm_token";
const USER_KEY = "pm_user";

export type User = {
  id: number;
  username: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

const BASE = "/api";

async function authRequest(path: string, body: unknown): Promise<AuthResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      message = data.detail || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export const login = (username: string, password: string) =>
  authRequest("/auth/login", { username, password });

export const register = (username: string, password: string) =>
  authRequest("/auth/register", { username, password });

export async function logout(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort — local session is cleared regardless
  } finally {
    clearSession();
  }
}

export async function fetchMe(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const user: User = await res.json();
  setUser(user);
  return user;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, token);
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function storeAuth(response: AuthResponse): void {
  setToken(response.token);
  setUser(response.user);
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}

export const getSession = (): boolean => getToken() !== null;
