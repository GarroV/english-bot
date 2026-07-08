"use client";

import { useState } from "react";
import type { ChartBucket } from "@/lib/billing/period";
import { formatRub } from "@/lib/format/money";

export interface ChartLabels {
  title: string;
  charged: string;
  received: string;
  empty: string;
}

// Цвета серий — категориальные токены дизайн-системы (light/dark задаёт globals.css).
const SERIES = [
  { key: "charged", color: "var(--chart-1)" },
  { key: "received", color: "var(--chart-2)" },
] as const;

const W = 640;
const H = 240;
const PAD = { top: 10, right: 8, bottom: 22, left: 46 };
const MAX_X_TICKS = 8;

// «Красивый» потолок оси — такой, чтобы и четверти сетки были круглыми
// (1→0.25, 2→0.5, 2.4→0.6, 3→0.75, 4→1, 6→1.5, 8→2 × 10^k).
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) {
    if (f * pow >= max) return f * pow;
  }
  return 10 * pow;
}

// Число оси без валюты: «12 500» (₽ есть в тултипе и заголовке).
const axisNum = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

// Линейный график «заработано vs получено» по бакетам периода: рукописный SVG
// (одна диаграмма — без тяжёлой chart-библиотеки), кросс-хэйр с тултипом, sr-only таблица.
export function EarningsChart({ buckets, labels }: { buckets: ChartBucket[]; labels: ChartLabels }) {
  const [hover, setHover] = useState<number | null>(null);

  const maxVal = Math.max(0, ...buckets.map((b) => Math.max(b.charged, b.received)));
  const isEmpty = maxVal === 0;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const yMax = niceCeil(maxVal);
  const n = buckets.length;
  const gw = n > 0 ? plotW / n : plotW;
  const xOf = (i: number) => PAD.left + (i + 0.5) * gw;
  const yOf = (v: number) => PAD.top + plotH * (1 - v / yMax);
  const linePath = (series: "charged" | "received") =>
    buckets.map((b, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(b[series]).toFixed(1)}`).join(" ");
  const xTickStep = Math.max(1, Math.ceil(n / MAX_X_TICKS));
  const gridLines = [0.25, 0.5, 0.75, 1];
  // Точки на каждом бакете — пока их немного; на плотных диапазонах точка только под курсором.
  const showDots = n <= 40;

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.key === "charged" ? labels.charged : labels.received}
        </span>
      ))}
    </div>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold tracking-tight">{labels.title}</h2>
        {!isEmpty && legend}
      </div>

      {isEmpty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={labels.title}>
            {/* сетка + подписи оси Y */}
            {gridLines.map((f) => (
              <g key={f}>
                <line x1={PAD.left} x2={W - PAD.right} y1={yOf(yMax * f)} y2={yOf(yMax * f)}
                  stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 6} y={yOf(yMax * f) + 3} textAnchor="end" fontSize={10}
                  style={{ fill: "var(--muted-foreground)" }}>
                  {axisNum(yMax * f)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
              stroke="var(--border)" strokeWidth={1} />

            {/* кросс-хэйр бакета под курсором */}
            {hover !== null && (
              <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.top} y2={PAD.top + plotH}
                stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            )}

            {/* линии серий */}
            {SERIES.map((s) => (
              <path key={s.key} d={linePath(s.key)} fill="none" stroke={s.color}
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ))}

            {/* точки: постоянные на редких бакетах + увеличенная под курсором */}
            {SERIES.map((s) => (
              <g key={s.key}>
                {showDots && buckets.map((b, i) => (
                  <circle key={b.key} cx={xOf(i)} cy={yOf(b[s.key])} r={2.5} fill={s.color} />
                ))}
                {hover !== null && (
                  <circle cx={xOf(hover)} cy={yOf(buckets[hover][s.key])} r={4.5}
                    fill={s.color} stroke="var(--card)" strokeWidth={2} />
                )}
              </g>
            ))}

            {/* подписи оси X (прореженные) */}
            {buckets.map((b, i) =>
              i % xTickStep === 0 ? (
                <text key={b.key} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10}
                  style={{ fill: "var(--muted-foreground)" }}>
                  {b.label}
                </text>
              ) : null,
            )}

            {/* хит-зоны ховера — на всю высоту графика */}
            {buckets.map((b, i) => (
              <rect key={b.key} x={PAD.left + i * gw} y={PAD.top} width={gw} height={plotH}
                fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            ))}
          </svg>

          {hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
              style={{
                left: `${((PAD.left + (hover + 0.5) * gw) / W) * 100}%`,
                transform: `translateX(${hover > buckets.length / 2 ? "calc(-100% - 8px)" : "8px"})`,
              }}
            >
              <p className="mb-1 font-semibold text-popover-foreground">{buckets[hover].label}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.key === "charged" ? labels.charged : labels.received}:{" "}
                  <span className="font-medium text-popover-foreground">{formatRub(buckets[hover][s.key])}</span>
                </p>
              ))}
            </div>
          )}

          {/* дублирующая таблица для скринридеров (и как «рельеф» к цвету) */}
          <table className="sr-only">
            <caption>{labels.title}</caption>
            <thead>
              <tr><th scope="col" /><th scope="col">{labels.charged}</th><th scope="col">{labels.received}</th></tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.label}</th>
                  <td>{formatRub(b.charged)}</td>
                  <td>{formatRub(b.received)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
