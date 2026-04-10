import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rounded-xl border border-[rgba(3,33,71,0.12)] bg-white px-4 py-3 shadow-[0_16px_32px_rgba(3,33,71,0.20)]">
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
