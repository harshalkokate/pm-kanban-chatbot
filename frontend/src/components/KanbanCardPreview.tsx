import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rounded-xl border border-[rgba(3,33,71,0.09)] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(3,33,71,0.18)]">
    <div className="min-w-0">
      <h4 className="break-words font-display text-sm font-semibold leading-snug text-[var(--navy-dark)]">
        {card.title}
      </h4>
      {card.details && (
        <p className="mt-1.5 break-words text-xs leading-5 text-[var(--gray-text)]">
          {card.details}
        </p>
      )}
    </div>
  </article>
);
