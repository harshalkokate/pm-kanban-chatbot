import {
  clearSession,
  fetchMe,
  getSession,
  getToken,
  getUser,
  login,
  logout,
  register,
  setToken,
  setUser,
  storeAuth,
} from "@/lib/auth";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("token storage", () => {
  it("getToken returns null when no token stored", () => {
    expect(getToken()).toBeNull();
  });

  it("setToken persists token and getToken returns it", () => {
    setToken("abc123");
    expect(getToken()).toBe("abc123");
  });

  it("getSession reflects presence of token", () => {
    expect(getSession()).toBe(false);
    setToken("x");
    expect(getSession()).toBe(true);
  });

  it("clearSession removes both token and user", () => {
    setToken("abc");
    setUser({ id: 1, username: "alice" });
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("storeAuth persists both token and user", () => {
    storeAuth({ token: "t1", user: { id: 5, username: "bob" } });
    expect(getToken()).toBe("t1");
    expect(getUser()).toEqual({ id: 5, username: "bob" });
  });

  it("getUser returns null for corrupted value", () => {
    localStorage.setItem("pm_user", "not-json");
    expect(getUser()).toBeNull();
  });
});

describe("login / register", () => {
  it("login posts to /api/auth/login and returns AuthResponse", async () => {
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ token: "tok", user: { id: 1, username: "alice" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const result = await login("alice", "password123");
    expect(result.token).toBe("tok");
    expect(result.user.username).toBe("alice");
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/auth/login");
    expect(call[1]?.method).toBe("POST");
    expect(call[1]?.body).toBe(
      JSON.stringify({ username: "alice", password: "password123" })
    );
  });

  it("login rejects with message on 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(login("alice", "wrong")).rejects.toThrow("Invalid credentials");
  });

  it("register posts to /api/auth/register", async () => {
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ token: "tok", user: { id: 2, username: "bob" } }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    await register("bob", "password123");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/auth/register");
  });
});

describe("fetchMe", () => {
  it("returns null when no token", async () => {
    expect(await fetchMe()).toBeNull();
  });

  it("returns user when /auth/me succeeds", async () => {
    setToken("abc");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1, username: "alice" }), {
        status: 200,
      })
    );
    const user = await fetchMe();
    expect(user).toEqual({ id: 1, username: "alice" });
    expect(getUser()).toEqual({ id: 1, username: "alice" });
  });

  it("clears session on 401", async () => {
    setToken("abc");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    expect(await fetchMe()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("sends Authorization header", async () => {
    setToken("mytoken");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1, username: "alice" }), { status: 200 })
    );
    await fetchMe();
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mytoken");
  });
});

describe("logout", () => {
  it("clears session locally even if network fails", async () => {
    setToken("tok");
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    await logout();
    expect(getToken()).toBeNull();
  });

  it("posts to /auth/logout with token", async () => {
    setToken("tok");
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    );
    await logout();
    expect(mockFetch.mock.calls[0][0]).toBe("/api/auth/logout");
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("no-op when no token set", async () => {
    const mockFetch = vi.spyOn(global, "fetch");
    await logout();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
