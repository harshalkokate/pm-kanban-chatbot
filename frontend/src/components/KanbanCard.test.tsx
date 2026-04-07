import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "@/components/KanbanCard";
import type { Card } from "@/lib/kanban";

// dnd-kit requires a DOM environment with pointer events; wrap in a plain div
const card: Card = {
  id: "card-test",
  title: "Test Task",
  details: "Some details here.",
};

describe("KanbanCard", () => {
  it("renders title and details", () => {
    render(<KanbanCard card={card} onDelete={vi.fn()} />);
    expect(screen.getByText("Test Task")).toBeInTheDocument();
    expect(screen.getByText("Some details here.")).toBeInTheDocument();
  });

  it("calls onDelete with the card id when Remove is clicked", async () => {
    const onDelete = vi.fn();
    render(<KanbanCard card={card} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete test task/i }));
    expect(onDelete).toHaveBeenCalledWith("card-test");
  });
});
