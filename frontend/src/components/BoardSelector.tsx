"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/api";

type BoardSelectorProps = {
  boards: BoardSummary[];
  activeBoardId: number | null;
  onSelect: (boardId: number) => void;
  onCreate: (title: string) => Promise<void>;
  onRename: (boardId: number, title: string) => Promise<void>;
  onDelete: (boardId: number) => Promise<void>;
};

export const BoardSelector = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSelectorProps) => {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await onCreate(title);
    setNewTitle("");
    setCreating(false);
  };

  const startRename = (board: BoardSummary) => {
    setRenamingId(board.id);
    setRenameValue(board.title);
  };

  const commitRename = async (boardId: number) => {
    const title = renameValue.trim();
    if (title && title !== boards.find((b) => b.id === boardId)?.title) {
      await onRename(boardId, title);
    }
    setRenamingId(null);
  };

  return (
    <aside
      className="flex w-60 shrink-0 flex-col gap-3 rounded-2xl border border-[var(--stroke)] bg-white/85 p-4 shadow-[var(--shadow)] backdrop-blur"
      aria-label="Board list"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          Boards
        </p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          aria-label="New board"
          className="rounded-full border border-[var(--stroke)] px-2 py-0.5 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          + New
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            aria-label="New board title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Board title"
            autoFocus
            className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewTitle("");
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="flex flex-col gap-1" role="list">
        {boards.map((board) => (
          <li key={board.id}>
            {renamingId === board.id ? (
              <input
                aria-label="Rename board"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(board.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(board.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-full rounded-lg border border-[var(--primary-blue)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none"
              />
            ) : (
              <div
                className={clsx(
                  "group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition",
                  activeBoardId === board.id
                    ? "bg-[var(--navy-dark)] text-white"
                    : "text-[var(--navy-dark)] hover:bg-[rgba(3,33,71,0.06)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(board.id)}
                  onDoubleClick={() => startRename(board)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="truncate font-medium">{board.title}</span>
                  <span
                    className={clsx(
                      "shrink-0 text-[10px] tabular-nums",
                      activeBoardId === board.id
                        ? "text-white/70"
                        : "text-[var(--gray-text)]"
                    )}
                  >
                    {board.card_count}
                  </span>
                </button>
                <div className="ml-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${board.title}`}
                    onClick={() => startRename(board)}
                    className={clsx(
                      "text-xs",
                      activeBoardId === board.id
                        ? "text-white/80 hover:text-white"
                        : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                    )}
                  >
                    ✎
                  </button>
                  {boards.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Delete ${board.title}`}
                      onClick={() => {
                        if (
                          confirm(`Delete board "${board.title}"? This cannot be undone.`)
                        ) {
                          onDelete(board.id);
                        }
                      }}
                      className={clsx(
                        "text-xs",
                        activeBoardId === board.id
                          ? "text-white/80 hover:text-red-200"
                          : "text-[var(--gray-text)] hover:text-red-500"
                      )}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};
