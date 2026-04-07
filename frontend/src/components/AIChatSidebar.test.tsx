import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "@/components/AIChatSidebar";

// vi.hoisted runs before imports, so values are safe to use in vi.mock factories
const { emptyBoard } = vi.hoisted(() => ({
  emptyBoard: { columns: [], cards: {} },
}));

vi.mock("@/lib/api", () => ({
  aiChat: vi.fn().mockResolvedValue({ message: "Sure, done!", board: emptyBoard }),
}));

const getInput = () => screen.getByLabelText(/chat message/i);
const getSendBtn = () => screen.getByRole("button", { name: /send/i });
const getToggleBtn = () => screen.getByRole("button", { name: /open ai chat/i });

/** Render the sidebar and open the chat panel. */
const renderAndOpen = async (onBoardUpdate = vi.fn()) => {
  render(<AIChatSidebar onBoardUpdate={onBoardUpdate} />);
  await userEvent.click(getToggleBtn());
};

describe("AIChatSidebar", () => {
  it("toggle button opens the chat panel", async () => {
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);
    expect(screen.queryByLabelText(/chat message/i)).not.toBeInTheDocument();
    await userEvent.click(getToggleBtn());
    expect(getInput()).toBeInTheDocument();
  });

  it("close button hides the chat panel", async () => {
    await renderAndOpen();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText(/chat message/i)).not.toBeInTheDocument();
  });

  it("shows placeholder text when no messages", async () => {
    await renderAndOpen();
    expect(screen.getByText(/ask me to add cards/i)).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", async () => {
    await renderAndOpen();
    expect(getSendBtn()).toBeDisabled();
  });

  it("send button is enabled when input has text", async () => {
    await renderAndOpen();
    await userEvent.type(getInput(), "hello");
    expect(getSendBtn()).not.toBeDisabled();
  });

  it("shows user message after sending", async () => {
    await renderAndOpen();
    await userEvent.type(getInput(), "Add a task");
    await userEvent.click(getSendBtn());
    expect(screen.getByText("Add a task")).toBeInTheDocument();
  });

  it("clears input after sending", async () => {
    await renderAndOpen();
    await userEvent.type(getInput(), "hello");
    await userEvent.click(getSendBtn());
    expect(getInput()).toHaveValue("");
  });

  it("shows AI response after sending", async () => {
    await renderAndOpen();
    await userEvent.type(getInput(), "hello");
    await userEvent.click(getSendBtn());
    expect(await screen.findByText("Sure, done!")).toBeInTheDocument();
  });

  it("calls onBoardUpdate with the board from the AI response", async () => {
    const board = { columns: [{ id: "1", title: "Updated", cardIds: [] }], cards: {} };
    const { aiChat } = await import("@/lib/api");
    vi.mocked(aiChat).mockResolvedValueOnce({ message: "Done", board });
    const onBoardUpdate = vi.fn();
    await renderAndOpen(onBoardUpdate);
    await userEvent.type(getInput(), "update board");
    await userEvent.click(getSendBtn());
    await screen.findByText("Done");
    expect(onBoardUpdate).toHaveBeenCalledWith(board);
  });

  it("sends on Enter key", async () => {
    await renderAndOpen();
    await userEvent.type(getInput(), "hello{Enter}");
    expect(await screen.findByText("hello")).toBeInTheDocument();
  });

  it("does not send on Shift+Enter", async () => {
    const { aiChat } = await import("@/lib/api");
    const mockFn = vi.mocked(aiChat);
    const callsBefore = mockFn.mock.calls.length;
    await renderAndOpen();
    await userEvent.type(getInput(), "hello");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(mockFn.mock.calls.length).toBe(callsBefore);
  });

  it("passes conversation history on follow-up messages", async () => {
    const { aiChat } = await import("@/lib/api");
    const mockFn = vi.mocked(aiChat);
    await renderAndOpen();

    await userEvent.type(getInput(), "first");
    await userEvent.click(getSendBtn());
    await screen.findByText("Sure, done!");

    await userEvent.type(getInput(), "second");
    await userEvent.click(getSendBtn());

    const lastCall = mockFn.mock.calls[mockFn.mock.calls.length - 1];
    const [, history] = lastCall;
    expect(history).toContainEqual({ role: "user", content: "first" });
    expect(history).toContainEqual({ role: "assistant", content: "Sure, done!" });
  });

  it("shows error message when API call fails", async () => {
    const { aiChat } = await import("@/lib/api");
    vi.mocked(aiChat).mockRejectedValueOnce(new Error("Network error"));
    await renderAndOpen();
    await userEvent.type(getInput(), "hello");
    await userEvent.click(getSendBtn());
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
