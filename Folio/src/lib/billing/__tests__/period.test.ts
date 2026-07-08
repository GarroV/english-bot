import { describe, it, expect } from "vitest";
import { resolvePeriod, buildChartBuckets } from "../period";
import type { BillingEntry } from "../fifo";

const charge = (amount: number, lessonDay: string): BillingEntry => ({
  id: `c${lessonDay}${amount}`, type: "charge", amount, note: null, created_at: `${lessonDay}T12:00:00Z`,
  lesson: { scheduled_at: `${lessonDay}T10:00:00Z`, status: "completed" },
});
const payment = (amount: number, day: string): BillingEntry => ({
  id: `p${day}${amount}`, type: "payment", amount, note: null, created_at: `${day}T12:00:00Z`, lesson: null,
});

const now = "2026-07-08T10:00:00Z"; // среда, июль 2026

describe("resolvePeriod", () => {
  it("дефолт — текущий месяц (обратная совместимость с ?m=)", () => {
    const p = resolvePeriod({}, now);
    expect(p.kind).toBe("month");
    expect(p.fromISO).toBe("2026-06-30T21:00:00.000Z");
    expect(p.toISO).toBe("2026-07-31T21:00:00.000Z");
    expect(p.label).toBe("июль 2026");
    expect(p.prevQS).toBe("p=month&m=2026-06");
    expect(p.nextQS).toBe("p=month&m=2026-08");
  });

  it("месяц по ?m=, битый ?m= откатывается к текущему", () => {
    expect(resolvePeriod({ m: "2026-02" }, now).label).toBe("февраль 2026");
    expect(resolvePeriod({ m: "2026-13" }, now).label).toBe("июль 2026");
  });

  it("неделя прилипает к понедельнику по Москве", () => {
    const p = resolvePeriod({ p: "week" }, now);
    expect(p.kind).toBe("week");
    // 08.07.2026 — среда; понедельник 06.07, московская полночь = 05.07 21:00 UTC
    expect(p.fromISO).toBe("2026-07-05T21:00:00.000Z");
    expect(p.toISO).toBe("2026-07-12T21:00:00.000Z");
    expect(p.label).toBe("06.07 — 12.07.26");
    expect(p.prevQS).toBe("p=week&w=2026-06-29");
    expect(p.nextQS).toBe("p=week&w=2026-07-13");
  });

  it("неделя по ?w= с любого дня недели", () => {
    const p = resolvePeriod({ p: "week", w: "2026-07-12" }, now); // воскресенье
    expect(p.fromISO).toBe("2026-07-05T21:00:00.000Z");
  });

  it("год", () => {
    const p = resolvePeriod({ p: "year", y: "2025" }, now);
    expect(p.fromISO).toBe("2024-12-31T21:00:00.000Z");
    expect(p.toISO).toBe("2025-12-31T21:00:00.000Z");
    expect(p.label).toBe("2025");
    expect(p.prevQS).toBe("p=year&y=2024");
    expect(p.nextQS).toBe("p=year&y=2026");
  });

  it("произвольный диапазон — обе даты включительно, стрелок нет", () => {
    const p = resolvePeriod({ p: "custom", from: "2026-07-01", to: "2026-07-10" }, now);
    expect(p.kind).toBe("custom");
    expect(p.fromISO).toBe("2026-06-30T21:00:00.000Z");
    expect(p.toISO).toBe("2026-07-10T21:00:00.000Z");
    expect(p.label).toBe("01.07.26 — 10.07.26");
    expect(p.prevQS).toBeNull();
    expect(p.customFrom).toBe("2026-07-01");
    expect(p.customTo).toBe("2026-07-10");
  });

  it("битый произвольный диапазон откатывается к текущему месяцу, но форма остаётся", () => {
    const p = resolvePeriod({ p: "custom", from: "2026-07-10", to: "2026-07-01" }, now);
    expect(p.kind).toBe("custom");
    expect(p.fromISO).toBe("2026-06-30T21:00:00.000Z");
    expect(p.customFrom).toBe("2026-07-01");
    expect(p.customTo).toBe("2026-07-31");
  });
});

describe("buildChartBuckets", () => {
  it("короткий диапазон — по дням; charge датируется занятием, payment — записью", () => {
    const p = resolvePeriod({ p: "week" }, now);
    const buckets = buildChartBuckets(
      [charge(700, "2026-07-06"), charge(300, "2026-07-06"), payment(500, "2026-07-08"), payment(100, "2026-06-01")],
      p.fromISO, p.toISO,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toEqual({ key: "2026-07-06", label: "06.07", charged: 1000, received: 0 });
    expect(buckets[2]).toEqual({ key: "2026-07-08", label: "08.07", charged: 0, received: 500 });
    // платёж вне диапазона не попадает никуда
    expect(buckets.reduce((s, b) => s + b.received, 0)).toBe(500);
  });

  it("год — 12 месячных бакетов с короткими подписями", () => {
    const p = resolvePeriod({ p: "year", y: "2026" }, now);
    const buckets = buildChartBuckets([charge(700, "2026-07-06"), payment(500, "2026-01-15")], p.fromISO, p.toISO);
    expect(buckets).toHaveLength(12);
    expect(buckets[0].label).toBe("янв");
    expect(buckets[0].received).toBe(500);
    expect(buckets[6].charged).toBe(700);
  });

  it("границы месячного бакета — по Москве (31.12 21:30 UTC уходит в январь)", () => {
    const p = resolvePeriod({ p: "custom", from: "2026-01-01", to: "2026-12-31" }, now);
    const newYearEve: BillingEntry = {
      id: "x", type: "payment", amount: 200, note: null, created_at: "2026-01-31T21:30:00Z", lesson: null,
    };
    const buckets = buildChartBuckets([newYearEve], p.fromISO, p.toISO);
    expect(buckets[1].received).toBe(200); // фев по Москве, не янв
  });

  it("диапазон в два года — подписи с годом", () => {
    const p = resolvePeriod({ p: "custom", from: "2025-11-01", to: "2026-02-28" }, now);
    const buckets = buildChartBuckets([], p.fromISO, p.toISO);
    expect(buckets[0].label).toBe("ноя ’25");
    expect(buckets[3].label).toBe("фев ’26");
  });
});
