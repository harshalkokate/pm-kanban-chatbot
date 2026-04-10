import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailModal } from "@/components/CardDetailModal";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: "1",
  title: "Existing",
  details: "existing details",
  priority: "high",
  due_date: "2026-12-01",
  assignee: "alice",
  labels: ["frontend"],
};

describe("CardDetailModal", () => {
  it("prefills the form with card values", () => {
    render(
      <CardDetailModal
        card={baseCard}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByLabelText(/title/i)).toHaveValue("Existing");
    expect(screen.getByLabelText(/description/i)).toHaveValue("existing details");
    expect(screen.getByLabelText(/priority/i)).toHaveValue("high");
    expect(screen.getByLabelText(/due date/i)).toHaveValue("2026-12-01");
    expect(screen.getByLabelText(/assignee/i)).toHaveValue("alice");
    expect(screen.getByLabelText(/labels/i)).toHaveValue("frontend");
  });

  it("save calls onSave with patch and closes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );
    await userEvent.clear(screen.getByLabelText(/title/i));
    await userEvent.type(screen.getByLabelText(/title/i), "Updated");
    await userEvent.clear(screen.getByLabelText(/labels/i));
    await userEvent.type(screen.getByLabelText(/labels/i), "a, b");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated", labels: ["a", "b"] })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("clear priority by selecting None", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CardDetailModal
        card={baseCard}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText(/priority/i), "");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ priority: null })
    );
  });

  it("rejects save with empty title", async () => {
    const onSave = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );
    await userEvent.clear(screen.getByLabelText(/title/i));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/title is required/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Escape key calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onClose={onClose}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("cancel button closes the modal", async () => {
    const onClose = vi.fn();
    render(
      <CardDetailModal
        card={baseCard}
        onClose={onClose}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
