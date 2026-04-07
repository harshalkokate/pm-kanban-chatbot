import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const { mockBoard } = vi.hoisted(() => ({
  mockBoard: {
    columns: [
      { id: "1", title: "Backlog", cardIds: ["1", "2"] },
      { id: "2", title: "Discovery", cardIds: [] },
      { id: "3", title: "In Progress", cardIds: [] },
      { id: "4", title: "Review", cardIds: [] },
      { id: "5", title: "Done", cardIds: [] },
    ],
    cards: {
      "1": { id: "1", title: "Align roadmap themes", details: "" },
      "2": { id: "2", title: "Gather customer signals", details: "" },
    },
  },
}));

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn().mockResolvedValue(mockBoard),
  renameColumn: vi.fn().mockResolvedValue(undefined),
  addCard: vi.fn().mockImplementation(
    (_colId: string, title: string, details: string) =>
      Promise.resolve({ id: `${Math.floor(Math.random() * 10000)}`, title, details })
  ),
  deleteCard: vi.fn().mockResolvedValue(undefined),
  moveCard: vi.fn().mockResolvedValue(undefined),
  aiChat: vi.fn().mockResolvedValue({ message: "ok", board: mockBoard }),
}));

const renderBoard = () => render(<KanbanBoard onLogout={vi.fn()} />);
const waitForBoard = () => screen.findAllByTestId(/column-/i);

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    renderBoard();
    expect(await waitForBoard()).toHaveLength(5);
  });

  it("shows a sign out button", async () => {
    renderBoard();
    await waitForBoard();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls onLogout when sign out is clicked", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard onLogout={onLogout} />);
    await waitForBoard();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renames a column", async () => {
    renderBoard();
    const [firstColumn] = await waitForBoard();
    const input = within(firstColumn).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds a card and it appears in the column", async () => {
    renderBoard();
    const [firstColumn] = await waitForBoard();
    await userEvent.click(
      within(firstColumn).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(firstColumn).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(
      within(firstColumn).getByPlaceholderText(/details/i),
      "Notes"
    );
    await userEvent.click(
      within(firstColumn).getByRole("button", { name: /add card/i })
    );
    expect(await within(firstColumn).findByText("New card")).toBeInTheDocument();
  });

  it("removes a card", async () => {
    renderBoard();
    const [firstColumn] = await waitForBoard();
    await userEvent.click(
      within(firstColumn).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(firstColumn).getByPlaceholderText(/card title/i),
      "Delete me"
    );
    await userEvent.click(
      within(firstColumn).getByRole("button", { name: /add card/i })
    );
    await within(firstColumn).findByText("Delete me");
    await userEvent.click(
      within(firstColumn).getByRole("button", { name: /delete delete me/i })
    );
    expect(
      within(firstColumn).queryByText("Delete me")
    ).not.toBeInTheDocument();
  });
});
