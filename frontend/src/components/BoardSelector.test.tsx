import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardSelector } from "@/components/BoardSelector";
import type { BoardSummary } from "@/lib/api";

const boards: BoardSummary[] = [
  { id: 1, title: "My Board", position: 0, card_count: 3 },
  { id: 2, title: "Side Project", position: 1, card_count: 0 },
];

const renderSelector = (overrides: Partial<Parameters<typeof BoardSelector>[0]> = {}) => {
  const props = {
    boards,
    activeBoardId: 1,
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<BoardSelector {...props} />);
  return props;
};

describe("BoardSelector", () => {
  it("renders all boards with card counts", () => {
    renderSelector();
    const sidebar = screen.getByRole("complementary", { name: /board list/i });
    expect(within(sidebar).getByText("My Board")).toBeInTheDocument();
    expect(within(sidebar).getByText("Side Project")).toBeInTheDocument();
    expect(within(sidebar).getByText("3")).toBeInTheDocument();
  });

  it("calls onSelect when a board is clicked", async () => {
    const { onSelect } = renderSelector();
    await userEvent.click(screen.getByText("Side Project"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("creating a board calls onCreate with trimmed title", async () => {
    const { onCreate } = renderSelector();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText(/new board title/i), "  Fresh  ");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith("Fresh");
  });

  it("create cancel button closes the form", async () => {
    renderSelector();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    expect(screen.getByLabelText(/new board title/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText(/new board title/i)).not.toBeInTheDocument();
  });

  it("does not render delete button when only one board", () => {
    renderSelector({ boards: [boards[0]] });
    expect(
      screen.queryByRole("button", { name: /delete my board/i })
    ).not.toBeInTheDocument();
  });
});
