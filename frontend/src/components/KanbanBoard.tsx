"use client";

import { useCallback, useEffect, useState } from "react";
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
import { BoardSelector } from "@/components/BoardSelector";
import { CardDetailModal } from "@/components/CardDetailModal";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard as computeMove, type BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";
import type { BoardSummary, CardPatch } from "@/lib/api";

type KanbanBoardProps = {
  username: string;
  onLogout: () => void;
};

const ACTIVE_BOARD_KEY = "pm_active_board";

export const KanbanBoard = ({ username, onLogout }: KanbanBoardProps) => {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refreshBoards = useCallback(async (): Promise<BoardSummary[]> => {
    const list = await api.listBoards();
    setBoards(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await refreshBoards();
        if (cancelled) return;
        if (list.length === 0) {
          setLoadError(true);
          return;
        }
        const stored =
          typeof window !== "undefined"
            ? Number(localStorage.getItem(ACTIVE_BOARD_KEY))
            : NaN;
        const initial = list.find((b) => b.id === stored) ?? list[0];
        setActiveBoardId(initial.id);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBoards]);

  useEffect(() => {
    if (activeBoardId == null) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_BOARD_KEY, String(activeBoardId));
    }
    let cancelled = false;
    api
      .fetchBoard(activeBoardId)
      .then((b) => {
        if (!cancelled) setBoard(b);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBoardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const cardsById = board?.cards ?? {};

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id || !board || activeBoardId == null) return;

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
      .moveCard(activeBoardId, cardId, newCol.id, newCol.cardIds.indexOf(cardId))
      .catch(() => {
        setBoard((prev) => (prev ? { ...prev, columns: prevColumns } : prev));
        setApiError("Failed to move card.");
      });
  };

  const setColumnTitle = (columnId: string, title: string) => {
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
    if (activeBoardId == null || !board) return;
    const original = board.columns.find((c) => c.id === columnId);
    if (!original || original.title === title) return;
    api.renameColumn(activeBoardId, columnId, title).catch(() => {
      setColumnTitle(columnId, original.title);
      setApiError("Failed to rename column.");
    });
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    if (activeBoardId == null) return;
    const card = await api.addCard(activeBoardId, columnId, { title, details });
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
    refreshBoards().catch(() => {});
  };

  const handleSaveCard = async (cardId: string, patch: CardPatch) => {
    if (activeBoardId == null) return;
    const updated = await api.updateCard(activeBoardId, cardId, patch);
    setBoard((prev) =>
      prev ? { ...prev, cards: { ...prev.cards, [updated.id]: updated } } : prev
    );
  };

  const handleDeleteCard = async (cardId: string) => {
    if (activeBoardId == null || !board) return;
    const prevBoard = board;
    const nextCards = { ...board.cards };
    delete nextCards[cardId];
    setBoard({
      ...board,
      cards: nextCards,
      columns: board.columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((id) => id !== cardId),
      })),
    });
    try {
      await api.deleteCard(activeBoardId, cardId);
      refreshBoards().catch(() => {});
    } catch {
      setBoard(prevBoard);
      setApiError("Failed to delete card.");
    }
  };

  const handleCreateBoardFromSelector = async (title: string) => {
    const created = await api.createBoard(title);
    await refreshBoards();
    setBoard(null);
    setActiveBoardId(created.id);
  };

  const handleRenameBoard = async (boardId: number, title: string) => {
    await api.renameBoard(boardId, title);
    await refreshBoards();
  };

  const handleDeleteBoard = async (boardId: number) => {
    try {
      await api.deleteBoard(boardId);
      const list = await refreshBoards();
      if (boardId === activeBoardId) {
        setBoard(null);
        setActiveBoardId(list[0]?.id ?? null);
      }
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to delete board."
      );
    }
  };

  if (loadError)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p role="alert" className="text-sm font-semibold text-red-500">
          Failed to load. Please refresh the page.
        </p>
      </div>
    );

  if (activeBoardId == null) return null;

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const openCard = openCardId ? cardsById[openCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-6 pb-24 pt-6">
        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
            onClick={() => setApiError(null)}
          >
            {apiError} (click to dismiss)
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white/85 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-white shadow-[0_6px_16px_rgba(3,33,71,0.25)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="18" rx="1.5" />
                <rect x="14" y="3" width="7" height="11" rx="1.5" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
                Project Management
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold leading-tight text-[var(--navy-dark)]">
                {board?.title ?? "Kanban Studio"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--gray-text)] md:inline">
              Signed in as <strong>{username}</strong>
            </span>
            {board && (
              <span className="hidden text-xs text-[var(--gray-text)] md:inline">
                {board.columns.reduce((acc, c) => acc + c.cardIds.length, 0)} cards
                across {board.columns.length} columns
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
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
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </header>

        <div className="flex flex-1 gap-4">
          <BoardSelector
            boards={boards}
            activeBoardId={activeBoardId}
            onSelect={setActiveBoardId}
            onCreate={handleCreateBoardFromSelector}
            onRename={handleRenameBoard}
            onDelete={handleDeleteBoard}
          />

          {board ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <section className="grid flex-1 grid-cols-5 gap-3">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds
                      .map((id) => board.cards[id])
                      .filter(Boolean)}
                    onRename={setColumnTitle}
                    onRenameCommit={handleRenameColumnCommit}
                    onAddCard={handleAddCard}
                    onOpenCard={setOpenCardId}
                  />
                ))}
              </section>
              <DragOverlay>
                {activeCard ? (
                  <div className="w-[260px]">
                    <KanbanCardPreview card={activeCard} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-[var(--gray-text)]">Loading board…</p>
            </div>
          )}
        </div>
      </main>

      {openCard && (
        <CardDetailModal
          card={openCard}
          onClose={() => setOpenCardId(null)}
          onSave={(patch) => handleSaveCard(openCard.id, patch)}
          onDelete={() => handleDeleteCard(openCard.id)}
        />
      )}

      {board && activeBoardId != null && (
        <AIChatSidebar
          boardId={activeBoardId}
          onBoardUpdate={(newBoard) => {
            setBoard(newBoard);
            refreshBoards().catch(() => {});
          }}
        />
      )}
    </div>
  );
};
