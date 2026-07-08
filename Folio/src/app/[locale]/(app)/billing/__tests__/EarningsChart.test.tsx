import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningsChart } from "../EarningsChart";
import type { ChartBucket } from "@/lib/billing/period";
import { formatRub } from "@/lib/format/money";

const labels = { title: "Динамика", charged: "Заработано", received: "Получено", empty: "Пусто" };

const buckets: ChartBucket[] = [
  { key: "2026-07-06", label: "06.07", charged: 700, received: 0 },
  { key: "2026-07-07", label: "07.07", charged: 0, received: 1000 },
  { key: "2026-07-08", label: "08.07", charged: 1400, received: 500 },
];

describe("EarningsChart (статический рендер)", () => {
  it("рисует по линии на серию через все бакеты и обе серии в легенде", () => {
    const html = renderToStaticMarkup(<EarningsChart buckets={buckets} labels={labels} />);
    // две линии (по одной на серию), каждая через 3 точки: M + два L
    const lines = html.match(/<path d="M[^"]*"/g) ?? [];
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l.match(/L/g)).toHaveLength(2);
    // точки на бакетах: 2 серии × 3 бакета
    expect(html.match(/<circle/g)).toHaveLength(6);
    expect(html).toContain("Заработано");
    expect(html).toContain("Получено");
    expect(html).toContain("06.07");
  });

  it("дублирует данные таблицей для скринридеров", () => {
    const html = renderToStaticMarkup(<EarningsChart buckets={buckets} labels={labels} />);
    expect(html.match(/<tr>/g)).toHaveLength(4); // шапка + 3 бакета
    expect(html).toContain(formatRub(1400));
  });

  it("пустой период — заглушка без SVG", () => {
    const empty = buckets.map((b) => ({ ...b, charged: 0, received: 0 }));
    const html = renderToStaticMarkup(<EarningsChart buckets={empty} labels={labels} />);
    expect(html).toContain("Пусто");
    expect(html).not.toContain("<svg");
  });
});
