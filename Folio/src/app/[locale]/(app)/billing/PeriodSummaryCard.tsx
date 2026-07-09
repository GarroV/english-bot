import { Link } from "@/i18n/navigation";
import type { MonthSummary } from "@/lib/billing/summary";
import type { Period, PeriodKind } from "@/lib/billing/period";
import { formatRub } from "@/lib/format/money";
import { CustomRangeForm, type RangeFormLabels } from "./CustomRangeForm";

export interface PeriodLabels {
  charged: string; received: string; awaiting: string; lessons: string;
  lessonsLine: string; forecast: string;
  week: string; month: string; year: string; custom: string;
  range: RangeFormLabels;
}

const PRESETS: { kind: PeriodKind; href: string }[] = [
  { kind: "week", href: "/billing?p=week" },
  { kind: "month", href: "/billing?p=month" },
  { kind: "year", href: "/billing?p=year" },
  { kind: "custom", href: "/billing?p=custom" },
];

// Серверный блок сводки за период: пресеты недели/месяца/года/диапазона (ссылки),
// стрелки ←/→ для пресетов, форма дат для произвольного периода, числа периода.
export function PeriodSummaryCard({ summary, awaiting, period, labels }: {
  summary: MonthSummary; awaiting: number; period: Period; labels: PeriodLabels;
}) {
  const presetName: Record<PeriodKind, string> = {
    week: labels.week, month: labels.month, year: labels.year, custom: labels.custom,
  };
  const stats: [string, string, string][] = [
    [labels.charged, formatRub(summary.charged), "text-foreground"],
    [labels.received, formatRub(summary.received), "text-emerald-600 dark:text-emerald-400"],
    [labels.awaiting, formatRub(awaiting), awaiting > 0 ? "text-destructive" : "text-foreground"],
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group">
          {PRESETS.map((p) => (
            <Link key={p.kind} href={p.href}
              aria-current={period.kind === p.kind ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                period.kind === p.kind
                  ? "border-transparent bg-accent font-semibold text-accent-foreground"
                  : "border-border hover:border-primary"
              }`}>
              {presetName[p.kind]}
            </Link>
          ))}
        </div>
        {period.prevQS && period.nextQS && (
          <div className="ml-auto flex gap-1">
            <Link href={`/billing?${period.prevQS}`} className="rounded-lg border border-border px-2.5 py-1 text-sm hover:border-primary" aria-label="prev">←</Link>
            <Link href={`/billing?${period.nextQS}`} className="rounded-lg border border-border px-2.5 py-1 text-sm hover:border-primary" aria-label="next">→</Link>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold tracking-tight capitalize">{period.label}</h2>
        {period.kind === "custom" && (
          <CustomRangeForm initialFrom={period.customFrom} initialTo={period.customTo} labels={labels.range} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-border/60 bg-background/60 px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            {/* KPI number in the app's heading style (matches dashboard MiniBlock) so the money reads as the hero. */}
            <p className={`mt-1.5 font-heading text-3xl font-bold tabular-nums leading-none ${cls}`}>{value}</p>
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
