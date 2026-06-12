"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface Labels { button: string; waiting: string; expired: string; error: string; }
type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min

export function LoginPanel({ labels }: { labels: Labels }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const router = useRouter();
  const polls = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (!res.ok) { timer.current = setTimeout(() => poll(token), POLL_MS); return; }
      const { status } = await res.json();

      if (status === "confirmed") {
        const s = await fetch("/api/auth/telegram/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled.current) return;
        if (s.ok) { router.push("/dashboard"); return; }
        setPhase("error");
        return;
      }
      timer.current = setTimeout(() => poll(token), POLL_MS);
    } catch {
      if (!cancelled.current) setPhase("error");
    }
  }, [router]);

  const start = useCallback(async () => {
    setPhase("waiting");
    polls.current = 0;
    try {
      const res = await fetch("/api/auth/telegram/start", { method: "POST" });
      if (!res.ok) { setPhase("error"); return; }
      const { token, deepLink } = await res.json();
      if (!token || !deepLink) { setPhase("error"); return; }
      window.open(deepLink, "_blank");
      poll(token);
    } catch {
      setPhase("error");
    }
  }, [poll]);

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
