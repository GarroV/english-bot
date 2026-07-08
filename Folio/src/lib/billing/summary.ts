// Месячная сводка «Денег»: заработано/получено, раскладка занятий, прогноз до конца месяца.
// Месяц определяется по Москве (UTC+3, без DST) — как весь продукт.
import type { BillingEntry } from "./fifo";
import { effectiveDate } from "./fifo";
import { chargeAmount } from "./amount";

const MSK_OFFSET_MS = 3 * 3_600_000;

export interface MonthLesson {
  id: string;
  scheduled_at: string;
  status: string;
  participants: { rate_override: number | null; default_rate: number | null }[];
}

export interface MonthSummary {
  charged: number; received: number;
  lessonsCompleted: number; lessonsCancelled: number; lessonsUpcoming: number;
  forecastCount: number; forecastAmount: number;
}

// "YYYY-MM" момента `iso` по московскому времени.
export function mskMonthKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + MSK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Границы месяца по Москве, выраженные в UTC (для range-запросов к timestamptz).
export function monthRangeUtc(monthKey: string): { fromISO: string; toISO: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const from = Date.UTC(y, m - 1, 1) - MSK_OFFSET_MS;
  const to = Date.UTC(y, m, 1) - MSK_OFFSET_MS;
  return { fromISO: new Date(from).toISOString(), toISO: new Date(to).toISOString() };
}

// Сдвигает месячный ключ на delta месяцев.
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
// Преобразует ключ месяца в русское название, например "2026-07" → "июль 2026".
export function monthLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_RU[m - 1]} ${y}`;
}

// Вычисляет месячную сводку: заработано, получено, статус занятий, прогноз.
export function buildMonthSummary(entries: BillingEntry[], lessons: MonthLesson[], monthKey: string, nowISO: string): MonthSummary {
  const { fromISO, toISO } = monthRangeUtc(monthKey);
  return buildRangeSummary(entries, lessons, fromISO, toISO, nowISO);
}

// Та же сводка для произвольного UTC-диапазона [fromISO, toISO) — недели/года/периода.
export function buildRangeSummary(entries: BillingEntry[], lessons: MonthLesson[], fromISO: string, toISO: string, nowISO: string): MonthSummary {
  const fromMs = new Date(fromISO).getTime();
  const toMs = new Date(toISO).getTime();
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= fromMs && t < toMs;
  };

  let charged = 0;
  let received = 0;
  for (const e of entries) {
    const eff = effectiveDate(e);
    if (!inRange(eff)) continue;
    // Скидки (отрицательные charges) уменьшают «заработано» — по спеке А3 сводка нетто.
    if (e.type === "charge") charged += e.amount;
    else received += e.amount;
  }

  let lessonsCompleted = 0, lessonsCancelled = 0, lessonsUpcoming = 0, forecastCount = 0, forecastAmount = 0;
  const now = new Date(nowISO).getTime();
  for (const l of lessons) {
    if (!inRange(l.scheduled_at)) continue;
    if (l.status === "completed") lessonsCompleted++;
    else if (l.status === "cancelled") lessonsCancelled++;
    else if (new Date(l.scheduled_at).getTime() > now) {
      lessonsUpcoming++;
      forecastCount++;
      for (const p of l.participants) forecastAmount += chargeAmount(p.rate_override, p.default_rate);
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { charged: r2(charged), received: r2(received), lessonsCompleted, lessonsCancelled, lessonsUpcoming, forecastCount, forecastAmount: r2(forecastAmount) };
}
