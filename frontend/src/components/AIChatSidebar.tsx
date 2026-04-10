"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import * as api from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type AIChatSidebarProps = {
  boardId: number;
  onBoardUpdate: (board: BoardData) => void;
};

export const AIChatSidebar = ({ boardId, onBoardUpdate }: AIChatSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await api.aiChat(boardId, text, messages);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.message },
      ]);
      onBoardUpdate(result.board);
    } catch (err) {
      console.error(err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: detail },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[520px] w-80 flex-col rounded-3xl border border-[var(--stroke)] bg-white shadow-[0_24px_48px_rgba(3,33,71,0.18)]">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
                AI Assistant
              </p>
              <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--navy-dark)]">
                Chat
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
            >
              Close
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="mt-6 px-2 text-center text-xs leading-6 text-[var(--gray-text)]">
                Ask me to add cards, move them between columns, or anything
                about your board.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    msg.role === "user"
                      ? "bg-[var(--navy-dark)] text-white"
                      : "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3">
                  <span className="text-xs text-[var(--gray-text)]">
                    Thinking...
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[var(--stroke)] p-4">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the AI..."
                rows={2}
                disabled={loading}
                aria-label="Chat message"
                className="flex-1 resize-none rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || !input.trim()}
                className="self-end rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--gray-text)]">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close AI chat" : "Open AI chat"}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-xs font-bold uppercase tracking-widest text-white shadow-[0_8px_24px_rgba(117,57,145,0.4)] transition hover:brightness-110"
      >
        {isOpen ? "✕" : "AI"}
      </button>
    </>
  );
};
