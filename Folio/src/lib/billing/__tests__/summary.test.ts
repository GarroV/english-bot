import { describe, it, expect } from "vitest";
import { buildMonthSummary, mskMonthKey, monthRangeUtc, shiftMonthKey, monthLabelRu, type MonthLesson } from "../summary";
import type { BillingEntry } from "../fifo";

const lesson = (day: string, status: string, rates: [number | null, number | null][]): MonthLesson => ({
  id: day + status, scheduled_at: `${day}T10:00:00Z`, status,
  participants: rates.map(([o, d]) => ({ rate_override: o, default_rate: d })),
});
const charge = (amount: number, lessonDay: string): BillingEntry => ({
  id: `c${lessonDay}${amount}`, type: "charge", amount, note: null, created_at: `${lessonDay}T12:00:00Z`,
  lesson: { scheduled_at: `${lessonDay}T10:00:00Z`, status: "completed" },
});
const payment = (amount: number, day: string): BillingEntry => ({
  id: `p${day}${amount}`, type: "payment", amount, note: null, created_at: `${day}T12:00:00Z`, lesson: null,
});

describe("месячные хелперы", () => {
  it("mskMonthKey: 31.12 21:30 UTC — это уже январь по Москве", () => {
    expect(mskMonthKey("2026-12-31T21:30:00Z")).toBe("2027-01");
    expect(mskMonthKey("2026-07-06T10:00:00Z")).toBe("2026-07");
  });
  it("monthRangeUtc отдаёт границы месяца по Москве в UTC", () => {
    const { fromISO, toISO } = monthRangeUtc("2026-07");
    expect(fromISO).toBe("2026-06-30T21:00:00.000Z");
    expect(toISO).toBe("2026-07-31T21:00:00.000Z");
  });
  it("shiftMonthKey ходит через границу года", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });
  it("monthLabelRu", () => { expect(monthLabelRu("2026-07")).toBe("июль 2026"); });
});

describe("buildMonthSummary", () => {
  const now = "2026-07-06T10:00:00Z";
  it("считает заработано/получено по месяцу и раскладку занятий", () => {
    const s = buildMonthSummary(
      [charge(700, "2026-07-02"), charge(700, "2026-06-25"), payment(1000, "2026-07-03"), payment(500, "2026-06-20")],
      [
        lesson("2026-07-02", "completed", [[null, 700]]),
        lesson("2026-07-04", "cancelled", [[null, 700]]),
        lesson("2026-07-20", "scheduled", [[900, 700], [null, 500]]),
      ],
      "2026-07", now,
    );
    expect(s.charged).toBe(700);          // только июльский charge
    expect(s.received).toBe(1000);
    expect(s.lessonsCompleted).toBe(1);
    expect(s.lessonsCancelled).toBe(1);
    expect(s.lessonsUpcoming).toBe(1);
    expect(s.forecastCount).toBe(1);
    expect(s.forecastAmount).toBe(1400);  // 900 (override) + 500 (default)
  });
  it("прошедшие scheduled-занятия не в прогнозе", () => {
    const s = buildMonthSummary([], [lesson("2026-07-01", "scheduled", [[null, 700]])], "2026-07", now);
    expect(s.forecastCount).toBe(0);
    expect(s.lessonsUpcoming).toBe(0);
  });
});
