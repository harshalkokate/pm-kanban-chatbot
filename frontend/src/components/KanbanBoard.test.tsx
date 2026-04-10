import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const { mockBoard, mockBoardTwo, boardList } = vi.hoisted(() => {
  const mockBoard = {
    id: 1,
    title: "My Board",
    columns: [
      { id: "1", title: "Backlog", cardIds: ["1", "2"] },
      { id: "2", title: "Discovery", cardIds: [] },
      { id: "3", title: "In Progress", cardIds: [] },
      { id: "4", title: "Review", cardIds: [] },
      { id: "5", title: "Done", cardIds: [] },
    ],
    cards: {
      "1": { id: "1", title: "Align roadmap themes", details: "", labels: [] },
      "2": { id: "2", title: "Gather customer signals", details: "", labels: [] },
    },
  };
  const mockBoardTwo = {
    id: 2,
    title: "Side Project",
    columns: [
      { id: "6", title: "Backlog", cardIds: [] },
      { id: "7", title: "Discovery", cardIds: [] },
      { id: "8", title: "In Progress", cardIds: [] },
      { id: "9", title: "Review", cardIds: [] },
      { id: "10", title: "Done", cardIds: [] },
    ],
    cards: {},
  };
  const boardList = [
    { id: 1, title: "My Board", position: 0, card_count: 2 },
    { id: 2, title: "Side Project", position: 1, card_count: 0 },
  ];
  return { mockBoard, mockBoardTwo, boardList };
});

vi.mock("@/lib/api", () => ({
  listBoards: vi.fn().mockResolvedValue(boardList),
  createBoard: vi
    .fn()
    .mockResolvedValue({ id: 3, title: "Created", position: 2, card_count: 0 }),
  renameBoard: vi
    .fn()
    .mockResolvedValue({ id: 1, title: "Renamed", position: 0, card_count: 2 }),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  fetchBoard: vi.fn().mockImplementation((id: number) =>
    Promise.resolve(id === 2 ? mockBoardTwo : mockBoard)
  ),
  renameColumn: vi.fn().mockResolvedValue(undefined),
  addCard: vi.fn().mockImplementation(
    (_boardId: number, _colId: string, input: { title: string; details?: string }) =>
      Promise.resolve({
        id: `${Math.floor(Math.random() * 10000)}`,
        title: input.title,
        details: input.details ?? "",
        labels: [],
      })
  ),
  updateCard: vi
    .fn()
    .mockImplementation((_boardId: number, id: string, patch: { title?: string }) =>
      Promise.resolve({
        id,
        title: patch.title ?? "updated",
        details: "",
        labels: [],
      })
    ),
  deleteCard: vi.fn().mockResolvedValue(undefined),
  moveCard: vi.fn().mockResolvedValue(undefined),
  aiChat: vi.fn().mockResolvedValue({ message: "ok", board: mockBoard }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const renderBoard = () =>
  render(<KanbanBoard username="alice" onLogout={vi.fn()} />);

const waitForBoardLoaded = async () => {
  await screen.findAllByTestId(/column-/i);
};

describe("KanbanBoard", () => {
  it("renders five columns after loading", async () => {
    renderBoard();
    const cols = await screen.findAllByTestId(/column-/i);
    expect(cols).toHaveLength(5);
  });

  it("shows a sign out button", async () => {
    renderBoard();
    await waitForBoardLoaded();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls onLogout when sign out clicked", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard username="alice" onLogout={onLogout} />);
    await waitForBoardLoaded();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows username in the header", async () => {
    renderBoard();
    await waitForBoardLoaded();
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("shows board list from API", async () => {
    renderBoard();
    await waitForBoardLoaded();
    const sidebar = screen.getByRole("complementary", { name: /board list/i });
    expect(within(sidebar).getByText("My Board")).toBeInTheDocument();
    expect(within(sidebar).getByText("Side Project")).toBeInTheDocument();
  });

  it("switches boards when selector clicked", async () => {
    const { fetchBoard } = await import("@/lib/api");
    renderBoard();
    await waitForBoardLoaded();
    const sidebar = screen.getByRole("complementary", { name: /board list/i });
    await userEvent.click(within(sidebar).getByText("Side Project"));
    await waitFor(() => {
      expect(vi.mocked(fetchBoard)).toHaveBeenCalledWith(2);
    });
  });

  it("creates a new board via selector", async () => {
    const { createBoard } = await import("@/lib/api");
    renderBoard();
    await waitForBoardLoaded();
    const sidebar = screen.getByRole("complementary", { name: /board list/i });
    await userEvent.click(within(sidebar).getByRole("button", { name: /new board/i }));
    await userEvent.type(within(sidebar).getByLabelText(/new board title/i), "Sprint 42");
    await userEvent.click(within(sidebar).getByRole("button", { name: /^create$/i }));
    await waitFor(() => {
      expect(vi.mocked(createBoard)).toHaveBeenCalledWith("Sprint 42");
    });
  });

  it("renames a column input locally", async () => {
    renderBoard();
    await waitForBoardLoaded();
    const [firstColumn] = screen.getAllByTestId(/column-/i);
    const input = within(firstColumn).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds a card and it appears in the column", async () => {
    renderBoard();
    await waitForBoardLoaded();
    const [firstColumn] = screen.getAllByTestId(/column-/i);
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
      within(firstColumn).getByRole("button", { name: /^add card$/i })
    );
    expect(
      await within(firstColumn).findByText("New card")
    ).toBeInTheDocument();
  });

  it("opens card detail modal when edit clicked", async () => {
    renderBoard();
    await waitForBoardLoaded();
    await userEvent.click(
      screen.getByRole("button", { name: /open align roadmap themes/i })
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
