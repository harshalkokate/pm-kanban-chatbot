import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => Promise<void>;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onRenameCommit,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[540px] flex-col rounded-2xl border border-[rgba(3,33,71,0.07)] p-4 transition",
        isOver
          ? "bg-[#eaf6fd] ring-2 ring-[var(--primary-blue)]"
          : "bg-[#f3f4f6]"
      )}
      data-testid={`column-${column.id}`}
    >
      {/* Column header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-8 rounded-full bg-[var(--accent-yellow)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </span>
        </div>
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={(event) => onRenameCommit(column.id, event.target.value)}
          className="mt-2 w-full bg-transparent font-display text-base font-semibold text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
          aria-label="Column title"
        />
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2.5">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[rgba(3,33,71,0.12)] px-3 py-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>

      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
