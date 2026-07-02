"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface Labels { button: string; waiting: string; expired: string; error: string; }
type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min

// Reused for plain login and for invite registration: pass inviteToken to register a new
// tutor, and redirectTo to control where to land after the session is minted.
export function LoginPanel({ labels, inviteToken, redirectTo }: {
  labels: Labels;
  inviteToken?: string;
  redirectTo?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const router = useRouter();
  const polls = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The poll loop reschedules itself through this ref so it never references its own
  // binding before declaration (react-hooks/immutability) — kept in sync below.
  const pollRef = useRef<(token: string) => void>(() => {});
  // The script-opened tab that took the user to Telegram. On success we close it so focus returns
  // to this (original) tab, which by then has minted the session and is navigating (#36). Guarded:
  // null on mobile (deep-link opens the app) or if the popup was blocked — .close() is then a no-op.
  const tgWindow = useRef<Window | null>(null);

  // Stop the polling loop and drop any pending timer when the panel unmounts.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(async (token: string) => {
    if (cancelled.current) return;
    polls.current += 1;
    if (polls.current > MAX_POLLS) { setPhase("expired"); return; }

    try {
      const res = await fetch(`/api/auth/telegram/status?token=${encodeURIComponent(token)}`);
      if (!res.ok) { timer.current = setTimeout(() => pollRef.current(token), POLL_MS); return; }
      const { status } = await res.json();

      if (status === "confirmed") {
        const s = await fetch("/api/auth/telegram/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled.current) return;
        if (s.ok) { tgWindow.current?.close(); router.push(redirectTo ?? "/dashboard"); return; }
        setPhase("error");
        return;
      }
      timer.current = setTimeout(() => pollRef.current(token), POLL_MS);
    } catch {
      if (!cancelled.current) setPhase("error");
    }
  }, [router, redirectTo]);

  // Keep the self-scheduling ref pointed at the latest poll.
  useEffect(() => { pollRef.current = poll; }, [poll]);

  const start = useCallback(async () => {
    setPhase("waiting");
    polls.current = 0;
    try {
      const res = await fetch("/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteToken ? { inviteToken } : {}),
      });
      if (!res.ok) { setPhase("error"); return; }
      const { token, deepLink } = await res.json();
      if (!token || !deepLink) { setPhase("error"); return; }
      tgWindow.current = window.open(deepLink, "_blank");
      poll(token);
    } catch {
      setPhase("error");
    }
  }, [poll, inviteToken]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={start}
        disabled={phase === "waiting"}
        className="w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
      >
        {labels.button}
      </button>
      {phase === "waiting" && <p className="text-sm text-muted-foreground">{labels.waiting}</p>}
      {phase === "expired" && <p className="text-sm text-amber-600">{labels.expired}</p>}
      {phase === "error" && <p className="text-sm text-red-600">{labels.error}</p>}
    </div>
  );
}
