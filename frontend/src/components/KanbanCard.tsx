import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onOpen: (cardId: string) => void;
};

const PRIORITY_STYLES: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", className: "bg-blue-100 text-blue-700" },
  high: { label: "High", className: "bg-amber-100 text-amber-700" },
  urgent: { label: "Urgent", className: "bg-red-100 text-red-700" },
};

const formatDueDate = (due: string) => {
  try {
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return due;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return due;
  }
};

const isOverdue = (due: string): boolean => {
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

export const KanbanCard = ({ card, onOpen }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyle = card.priority ? PRIORITY_STYLES[card.priority] : null;
  const overdue = card.due_date ? isOverdue(card.due_date) : false;
  const labels = card.labels ?? [];

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-xl border border-[rgba(3,33,71,0.08)] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(3,33,71,0.06)]",
        "transition-all duration-150 hover:-translate-y-0.5 hover:border-[rgba(3,33,71,0.16)] hover:shadow-[0_6px_18px_rgba(3,33,71,0.10)]",
        isDragging && "opacity-50 shadow-[0_12px_28px_rgba(3,33,71,0.15)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="min-w-0 pr-7">
        <h4 className="break-words font-display text-sm font-semibold leading-snug text-[var(--navy-dark)]">
          {card.title}
        </h4>
        {card.details && (
          <p className="mt-1.5 break-words text-xs leading-5 text-[var(--gray-text)]">
            {card.details}
          </p>
        )}

        {(priorityStyle || card.due_date || card.assignee || labels.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {priorityStyle && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  priorityStyle.className
                )}
                aria-label={`Priority ${priorityStyle.label}`}
              >
                {priorityStyle.label}
              </span>
            )}
            {card.due_date && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  overdue
                    ? "bg-red-100 text-red-700"
                    : "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]"
                )}
                aria-label={`Due ${card.due_date}`}
              >
                {formatDueDate(card.due_date)}
              </span>
            )}
            {card.assignee && (
              <span
                className="rounded-full bg-[rgba(117,57,145,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[var(--secondary-purple)]"
                aria-label={`Assigned to ${card.assignee}`}
              >
                @{card.assignee}
              </span>
            )}
            {labels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-[rgba(236,173,10,0.18)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-yellow)]"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(card.id);
        }}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--gray-text)] opacity-0 transition group-hover:opacity-100 hover:bg-[rgba(32,157,215,0.12)] hover:text-[var(--primary-blue)] focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-blue)]"
        aria-label={`Open ${card.title}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </article>
  );
};
