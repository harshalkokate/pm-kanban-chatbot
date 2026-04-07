import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

beforeEach(() => localStorage.removeItem("pm_session"));

const fillAndSubmit = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginForm", () => {
  it("renders username, password fields and sign in button", () => {
    render(<LoginForm onLogin={vi.fn()} />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls onLogin with correct credentials", async () => {
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await fillAndSubmit("user", "password");
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("does not call onLogin with wrong credentials", async () => {
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await fillAndSubmit("admin", "wrong");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("shows an error message on invalid credentials", async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    await fillAndSubmit("user", "wrong");
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i);
  });

  it("clears the error when the user starts typing again", async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    await fillAndSubmit("user", "wrong");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/password/i), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sets the session on successful login", async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    await fillAndSubmit("user", "password");
    expect(localStorage.getItem("pm_session")).toBe("1");
  });
});
