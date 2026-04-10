import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    storeAuth: vi.fn(),
  };
});

import * as auth from "@/lib/auth";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const fillAndSubmit = async (
  username: string,
  password: string,
  buttonName: RegExp = /sign in/i
) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: buttonName }));
};

describe("LoginForm", () => {
  it("renders username, password and sign in button", () => {
    render(<LoginForm onLogin={vi.fn()} />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls login on submit and invokes onLogin on success", async () => {
    vi.mocked(auth.login).mockResolvedValue({
      token: "tok",
      user: { id: 1, username: "alice" },
    });
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await fillAndSubmit("alice", "password123");
    await waitFor(() => expect(onLogin).toHaveBeenCalledOnce());
    expect(auth.login).toHaveBeenCalledWith("alice", "password123");
    expect(auth.storeAuth).toHaveBeenCalled();
  });

  it("shows error on invalid credentials", async () => {
    vi.mocked(auth.login).mockRejectedValue(new Error("Invalid credentials"));
    render(<LoginForm onLogin={vi.fn()} />);
    await fillAndSubmit("alice", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid/i);
  });

  it("clears error when typing again", async () => {
    vi.mocked(auth.login).mockRejectedValue(new Error("Invalid credentials"));
    render(<LoginForm onLogin={vi.fn()} />);
    await fillAndSubmit("alice", "nope");
    await screen.findByRole("alert");
    await userEvent.type(screen.getByLabelText(/password/i), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toggles to register mode", async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });

  it("calls register in register mode", async () => {
    vi.mocked(auth.register).mockResolvedValue({
      token: "tok",
      user: { id: 2, username: "bob" },
    });
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await fillAndSubmit("bob", "password123", /create account/i);
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith("bob", "password123"));
    expect(onLogin).toHaveBeenCalled();
  });

  it("shows error on register failure", async () => {
    vi.mocked(auth.register).mockRejectedValue(new Error("Username already taken"));
    render(<LoginForm onLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await fillAndSubmit("dup", "password123", /create account/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(/taken/i);
  });
});
