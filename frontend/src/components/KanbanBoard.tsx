"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard as computeMove, type BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";

type KanbanBoardProps = {
  onLogout: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api.fetchBoard().then(setBoard).catch(() => setLoadError(true));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id || !board) return;

    const prevColumns = board.columns;
    const newColumns = computeMove(
      board.columns,
      active.id as string,
      over.id as string
    );
    setBoard((prev) => (prev ? { ...prev, columns: newColumns } : prev));

    const cardId = active.id as string;
    const newCol = newColumns.find((col) => col.cardIds.includes(cardId));
    if (!newCol) return;
    api
      .moveCard(cardId, newCol.id, newCol.cardIds.indexOf(cardId))
      .catch(() => {
        setBoard((prev) => (prev ? { ...prev, columns: prevColumns } : prev));
        setApiError("Failed to move card.");
      });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((col) =>
              col.id === columnId ? { ...col, title } : col
            ),
          }
        : prev
    );
  };

  const handleRenameColumnCommit = (columnId: string, title: string) => {
    const prevColumns = board?.columns ?? [];
    const original = prevColumns.find((c) => c.id === columnId);
    if (!original || original.title === title) return;
    api.renameColumn(columnId, title).catch(() => {
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.id === columnId ? { ...c, title: original.title } : c
              ),
            }
          : prev
      );
      setApiError("Failed to rename column.");
    });
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    const card = await api.addCard(columnId, title, details);
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            cards: { ...prev.cards, [card.id]: card },
            columns: prev.columns.map((col) =>
              col.id === columnId
                ? { ...col, cardIds: [...col.cardIds, card.id] }
                : col
            ),
          }
        : prev
    );
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    const prevBoard = board;
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            cards: Object.fromEntries(
              Object.entries(prev.cards).filter(([id]) => id !== cardId)
            ),
            columns: prev.columns.map((col) =>
              col.id === columnId
                ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) }
                : col
            ),
          }
        : prev
    );
    api.deleteCard(cardId).catch(() => {
      setBoard(prevBoard);
      setApiError("Failed to delete card.");
    });
  };

  if (loadError)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm font-semibold text-red-500">
          Failed to load board. Please refresh the page.
        </p>
      </div>
    );

  if (!board) return null;

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-8 px-8 pb-28 pt-10">
        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
            onClick={() => setApiError(null)}
          >
            {apiError} (click to dismiss)
          </div>
        )}

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-[var(--stroke)] bg-white/85 px-10 py-8 shadow-[var(--shadow)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Single Board Kanban
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-7 text-[var(--gray-text)]">
              Keep momentum visible. Rename columns, drag cards between stages,
              and capture quick notes without getting buried in settings.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-[var(--stroke)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
          >
            Sign out
          </button>
        </header>

        {/* Board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid grid-cols-5 gap-4">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((id) => board.cards[id]).filter(Boolean)}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameColumnCommit}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[240px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Floating AI chat widget */}
      <AIChatSidebar onBoardUpdate={(newBoard) => setBoard(newBoard)} />
    </div>
  );
};
