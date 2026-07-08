import { Link } from "@/i18n/navigation";
import type { MonthSummary } from "@/lib/billing/summary";
import { formatRub } from "@/lib/format/money";

export interface SummaryLabels {
  charged: string; received: string; awaiting: string; lessons: string;
  lessonsLine: string; forecast: string;
}

// Серверный презентационный блок: числа месяца + переключатель месяцев ссылками (?m=YYYY-MM).
export function MonthSummaryCard({ summary, awaiting, monthLabel, prevHref, nextHref, labels }: {
  summary: MonthSummary; awaiting: number; monthLabel: string;
  prevHref: string; nextHref: string; labels: SummaryLabels;
}) {
  const stats: [string, string, string][] = [
    [labels.charged, formatRub(summary.charged), "text-foreground"],
    [labels.received, formatRub(summary.received), "text-emerald-600 dark:text-emerald-400"],
    [labels.awaiting, formatRub(awaiting), awaiting > 0 ? "text-destructive" : "text-foreground"],
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold tracking-tight capitalize">{monthLabel}</h2>
        <div className="flex gap-1">
          <Link href={prevHref} className="rounded-lg border border-border px-2.5 py-1 text-sm hover:border-primary" aria-label="prev">←</Link>
          <Link href={nextHref} className="rounded-lg border border-border px-2.5 py-1 text-sm hover:border-primary" aria-label="next">→</Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(([label, value, cls]) => (
          <div key={label} className="rounded-xl bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{labels.lessons}:</span> {labels.lessonsLine}
      </p>
      {summary.forecastCount > 0 && (
        <p className="mt-1 text-xs text-muted-foreground/80">{labels.forecast}</p>
      )}
    </section>
  );
}
