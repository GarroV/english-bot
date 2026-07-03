"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/homework/queries";

const POLL_INTERVAL_MS = 10_000;
const MAX_MESSAGE_LEN = 5000;

export interface ChatLabels {
  title: string;
  placeholder: string;
  send: string;
  sending: string;
  empty: string;
  sendError: string;
  tutorLabel: string;
  studentLabel: string;
}

// A per-assignment chat thread shared by the tutor review dialog and the student cabinet. All text is
// rendered as escaped JSX (no dangerouslySetInnerHTML). `mine` decides which side each message sits on;
// the parent passes the current viewer's role so the same component serves both sides. Polls onRefresh
// every 10s while mounted (interval cleared on unmount). Send/refresh go through server actions passed
// in by the parent — this component never touches Supabase directly.
export function ChatThread({
  messages: initial,
  mine,
  onSend,
  onRefresh,
  labels,
}: {
  messages: ChatMessage[];
  mine: "student" | "tutor";
  onSend: (body: string) => Promise<{ ok: boolean }>;
  onRefresh: () => Promise<ChatMessage[]>;
  labels: ChatLabels;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  // Keep the latest onRefresh in a ref so the polling interval below is set up once (stable deps) yet
  // always calls the current closure — the parent passes a fresh inline onRefresh each render, and
  // depending on it directly would reset the 10s timer on every keystroke and starve the poll.
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  // Poll for new messages while mounted; clear the interval on unmount so a late refresh never fires
  // against a gone component. A stale response is dropped via the `active` guard.
  useEffect(() => {
    let active = true;
    const id = setInterval(() => {
      // Skip while the tab is backgrounded — avoids needless service-role queries per open thread.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshRef.current()
        .then((next) => { if (active) setMessages(next); })
        .catch(() => { /* transient poll failure — keep the current thread */ });
    }, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(false);
    try {
      const res = await onSend(body);
      if (res.ok) {
        setDraft("");
        const next = await onRefresh();
        setMessages(next);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{labels.title}</p>

      {messages.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} isMine={m.author === mine} labels={labels} />
          ))}
        </ul>
      )}

      <div className="mt-1 flex flex-col gap-1">
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(false); }}
          rows={2}
          maxLength={MAX_MESSAGE_LEN}
          placeholder={labels.placeholder}
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || draft.trim().length === 0}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {sending ? labels.sending : labels.send}
          </button>
          {error && <span className="text-xs text-destructive">{labels.sendError}</span>}
        </div>
      </div>
    </div>
  );
}

// One message bubble. Own messages align right; the other side's align left, each tagged with its role.
function MessageBubble({ message, isMine, labels }: {
  message: ChatMessage;
  isMine: boolean;
  labels: ChatLabels;
}) {
  const roleLabel = message.author === "tutor" ? labels.tutorLabel : labels.studentLabel;
  return (
    <li className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isMine
            ? "bg-primary/12 text-foreground"
            : "border border-border bg-card text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
      </div>
      <span className="mt-0.5 px-1 text-[0.65rem] text-muted-foreground">
        {roleLabel} · {formatTime(message.createdAt)}
      </span>
    </li>
  );
}

// Compact Moscow-time stamp for a message (matches the cabinet's date formatting locale/timezone).
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
