"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];

// Cycles system → light → dark. Renders a placeholder until mounted to avoid hydration mismatch.
export function ThemeToggle({ labels }: { labels: Record<Mode, string> }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <span className="inline-block h-9 w-9" aria-hidden />;

  const current = (ORDER.includes(theme as Mode) ? theme : "system") as Mode;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Laptop;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={labels[current]}
      title={labels[current]}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
