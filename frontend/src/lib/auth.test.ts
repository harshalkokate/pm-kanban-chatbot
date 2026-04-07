import { checkCredentials, getSession, setSession, clearSession } from "@/lib/auth";

describe("checkCredentials", () => {
  it("returns true for correct credentials", () => {
    expect(checkCredentials("user", "password")).toBe(true);
  });

  it("returns false for wrong username", () => {
    expect(checkCredentials("admin", "password")).toBe(false);
  });

  it("returns false for wrong password", () => {
    expect(checkCredentials("user", "wrong")).toBe(false);
  });

  it("returns false for empty credentials", () => {
    expect(checkCredentials("", "")).toBe(false);
  });
});

describe("session helpers", () => {
  beforeEach(() => localStorage.removeItem("pm_session"));

  it("getSession returns false when no session exists", () => {
    expect(getSession()).toBe(false);
  });

  it("setSession then getSession returns true", () => {
    setSession();
    expect(getSession()).toBe(true);
  });

  it("clearSession removes the session", () => {
    setSession();
    clearSession();
    expect(getSession()).toBe(false);
  });
});
