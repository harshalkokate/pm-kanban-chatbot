import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "@/components/KanbanCard";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: "card-test",
  title: "Test Task",
  details: "Some details here.",
};

describe("KanbanCard", () => {
  it("renders title and details", () => {
    render(<KanbanCard card={baseCard} onOpen={vi.fn()} />);
    expect(screen.getByText("Test Task")).toBeInTheDocument();
    expect(screen.getByText("Some details here.")).toBeInTheDocument();
  });

  it("calls onOpen with card id when edit button clicked", async () => {
    const onOpen = vi.fn();
    render(<KanbanCard card={baseCard} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /open test task/i }));
    expect(onOpen).toHaveBeenCalledWith("card-test");
  });

  it("shows priority badge", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, priority: "high" }}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/priority high/i)).toBeInTheDocument();
  });

  it("shows due date badge", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, due_date: "2026-12-01" }}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/due 2026-12-01/i)).toBeInTheDocument();
  });

  it("shows assignee badge", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, assignee: "alice" }}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/assigned to alice/i)).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("shows label chips", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, labels: ["frontend", "bug"] }}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });
});
