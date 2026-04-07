import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewCardForm } from "@/components/NewCardForm";

// onAdd is async — mock it to return a resolved Promise
const mockOnAdd = () => vi.fn().mockResolvedValue(undefined);

describe("NewCardForm", () => {
  it("shows the add button by default", () => {
    render(<NewCardForm onAdd={mockOnAdd()} />);
    expect(screen.getByRole("button", { name: /add a card/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/card title/i)).not.toBeInTheDocument();
  });

  it("opens the form on button click", async () => {
    render(<NewCardForm onAdd={mockOnAdd()} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(screen.getByPlaceholderText(/card title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/details/i)).toBeInTheDocument();
  });

  it("calls onAdd with title and details on submit", async () => {
    const onAdd = mockOnAdd();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "My Task");
    await userEvent.type(screen.getByPlaceholderText(/details/i), "Some notes");
    await userEvent.click(screen.getByRole("button", { name: /^add card$/i }));
    expect(onAdd).toHaveBeenCalledWith("My Task", "Some notes");
  });

  it("trims whitespace from title and details", async () => {
    const onAdd = mockOnAdd();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "  Trimmed  ");
    await userEvent.click(screen.getByRole("button", { name: /^add card$/i }));
    expect(onAdd).toHaveBeenCalledWith("Trimmed", "");
  });

  it("does not call onAdd when title is blank", async () => {
    const onAdd = mockOnAdd();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /^add card$/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("cancel closes the form and resets fields", async () => {
    render(<NewCardForm onAdd={mockOnAdd()} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "Draft");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByPlaceholderText(/card title/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(screen.getByPlaceholderText(/card title/i)).toHaveValue("");
  });

  it("closes and resets after a successful add", async () => {
    render(<NewCardForm onAdd={mockOnAdd()} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "Done");
    await userEvent.click(screen.getByRole("button", { name: /^add card$/i }));
    expect(await screen.findByRole("button", { name: /add a card/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/card title/i)).not.toBeInTheDocument();
  });
});
