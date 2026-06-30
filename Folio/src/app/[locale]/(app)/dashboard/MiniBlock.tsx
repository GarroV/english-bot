"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

type Tone = "teal" | "amber" | "coral";

const toneClass: Record<Tone, string> = {
  teal: "bg-primary/12 text-primary",
  amber: "bg-amber-500/15 text-amber-500",
  coral: "bg-[color:var(--brand-coral)]/15 text-[color:var(--brand-coral)]",
};
const valueClass: Record<Tone, string> = {
  teal: "text-primary",
  amber: "text-amber-500",
  coral: "text-[color:var(--brand-coral)]",
};

// Expandable summary tile: big number + label in the header (a toggle button),
// detailed list revealed below. Open by default.
export function MiniBlock({
  icon, value, title, sub, tone = "teal", defaultOpen = true, children,
}: {
  icon: React.ReactNode;
  value: string;
  title: string;
  sub: string;
  tone?: Tone;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${toneClass[tone]}`}>{icon}</span>
        <span className={`font-heading text-3xl font-bold tabular-nums leading-none ${valueClass[tone]}`}>{value}</span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <ChevronRight className={`ml-auto h-4 w-4 flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="mt-3 border-t border-border pt-2">{children}</div>}
    </section>
  );
}
