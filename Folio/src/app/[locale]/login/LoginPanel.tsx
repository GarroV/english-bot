"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface Labels { button: string; waiting: string; expired: string; error: string; }
type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min

export function LoginPanel({ labels }: { labels: Labels }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const router = useRouter();
  const polls = useRef(0);

  const poll = useCallback(async (token: string) => {
    polls.current += 1;
    if (polls.current > MAX_POLLS) { setPhase("expired"); return; }

    const res = await fetch(`/api/auth/telegram/status?token=${encodeURIComponent(token)}`);
    const { status } = await res.json();
    if (status === "confirmed") {
      const s = await fetch("/api/auth/telegram/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (s.ok) { router.push("/dashboard"); return; }
      setPhase("error"); return;
    }
    setTimeout(() => poll(token), POLL_MS);
  }, [router]);

  const start = useCallback(async () => {
    setPhase("waiting");
    polls.current = 0;
    const res = await fetch("/api/auth/telegram/start", { method: "POST" });
    const { token, deepLink } = await res.json();
    window.open(deepLink, "_blank");
    poll(token);
  }, [poll]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={start}
        disabled={phase === "waiting"}
        className="rounded-md bg-sky-600 px-5 py-2.5 font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
      >
        {labels.button}
      </button>
      {phase === "waiting" && <p className="text-sm text-zinc-500">{labels.waiting}</p>}
      {phase === "expired" && <p className="text-sm text-amber-600">{labels.expired}</p>}
      {phase === "error" && <p className="text-sm text-red-600">{labels.error}</p>}
    </div>
  );
}
