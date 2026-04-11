"use client";

import { useEffect, useState } from "react";
import type { Card, Priority } from "@/lib/kanban";
import type { CardPatch } from "@/lib/api";

type CardDetailModalProps = {
  card: Card;
  onClose: () => void;
  onSave: (patch: CardPatch) => Promise<void>;
  onDelete: () => Promise<void>;
};

const PRIORITIES: { value: Priority | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const CardDetailModal = ({
  card,
  onClose,
  onSave,
  onDelete,
}: CardDetailModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | "">(
    (card.priority ?? "") as Priority | ""
  );
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const [labelsInput, setLabelsInput] = useState(
    (card.labels ?? []).join(", ")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const labels = labelsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const patch: CardPatch = {
        title: trimmedTitle,
        details,
        priority: priority === "" ? null : priority,
        dueDate: dueDate.trim() === "" ? null : dueDate,
        assignee: assignee.trim() === "" ? null : assignee,
        labels,
      };
      await onSave(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit card"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[0_20px_50px_rgba(3,33,71,0.2)]">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            Edit card
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-sm text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="card-title"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Title
            </label>
            <input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          <div>
            <label
              htmlFor="card-details"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Description
            </label>
            <textarea
              id="card-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-y rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="card-priority"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Priority
              </label>
              <select
                id="card-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority | "")}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="card-due"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Due date
              </label>
              <input
                id="card-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="card-assignee"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Assignee
            </label>
            <input
              id="card-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="e.g. alice"
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          <div>
            <label
              htmlFor="card-labels"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Labels (comma separated)
            </label>
            <input
              id="card-labels"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              placeholder="frontend, bug"
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-500">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={async () => {
                if (confirm("Delete this card?")) {
                  await onDelete();
                  onClose();
                }
              }}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-500 transition hover:bg-red-50"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
