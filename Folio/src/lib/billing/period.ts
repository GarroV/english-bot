// Периоды вкладки «Деньги» (неделя / месяц / год / произвольный диапазон) и бакеты
// для графика «заработано vs получено». Всё по Москве (UTC+3, без DST) — как весь продукт.
import type { BillingEntry } from "./fifo";
import { effectiveDate } from "./fifo";
import { mskMonthKey, monthRangeUtc, shiftMonthKey, monthLabelRu } from "./summary";

const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
// Диапазоны длиннее этого рисуем помесячно, короче — по дням.
const MAX_DAILY_BUCKETS = 62;

export type PeriodKind = "week" | "month" | "year" | "custom";

export interface Period {
  kind: PeriodKind;
  fromISO: string; // UTC-граница начала (включительно)
  toISO: string; // UTC-граница конца (исключительно)
  label: string;
  prevQS: string | null; // query для стрелки ← (null — стрелка скрыта)
  nextQS: string | null;
  // Значения для формы произвольного диапазона (YYYY-MM-DD, MSK, обе даты включительно).
  customFrom: string;
  customTo: string;
}

export interface PeriodParams {
  p?: string;
  m?: string;
  w?: string;
  y?: string;
  from?: string;
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;

// UTC-момент московской полуночи даты "YYYY-MM-DD".
function mskDateStartMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - MSK_OFFSET_MS;
}

// Московская дата момента `ms` как "YYYY-MM-DD".
function mskDateKey(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// "ДД.ММ" / "ДД.ММ.ГГ" по московскому времени.
function mskDM(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}`;
}
function mskDMY(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS);
  return `${mskDM(ms)}.${String(d.getUTCFullYear()).slice(2)}`;
}

// Понедельник (московской) недели, содержащей момент `ms` — UTC-момент его полуночи.
function mskMondayMs(ms: number): number {
  const shifted = new Date(ms + MSK_OFFSET_MS);
  const dow = (shifted.getUTCDay() + 6) % 7;
  return mskDateStartMs(mskDateKey(ms)) - dow * DAY_MS;
}

// Разбирает query-параметры периода в диапазон с подписью и стрелками. Некорректные
// значения тихо откатываются к дефолту (текущий месяц / текущая неделя / текущий год).
export function resolvePeriod(params: PeriodParams, nowISO: string): Period {
  const nowMs = new Date(nowISO).getTime();

  if (params.p === "week") {
    const base = params.w && DATE_RE.test(params.w) ? mskDateStartMs(params.w) : nowMs;
    const from = mskMondayMs(base);
    const to = from + 7 * DAY_MS;
    return {
      kind: "week",
      fromISO: new Date(from).toISOString(),
      toISO: new Date(to).toISOString(),
      label: `${mskDM(from)} — ${mskDMY(to - DAY_MS)}`,
      prevQS: `p=week&w=${mskDateKey(from - 7 * DAY_MS)}`,
      nextQS: `p=week&w=${mskDateKey(from + 7 * DAY_MS)}`,
      customFrom: mskDateKey(from),
      customTo: mskDateKey(to - DAY_MS),
    };
  }

  if (params.p === "year") {
    const year = params.y && YEAR_RE.test(params.y)
      ? Number(params.y)
      : new Date(nowMs + MSK_OFFSET_MS).getUTCFullYear();
    const from = Date.UTC(year, 0, 1) - MSK_OFFSET_MS;
    const to = Date.UTC(year + 1, 0, 1) - MSK_OFFSET_MS;
    return {
      kind: "year",
      fromISO: new Date(from).toISOString(),
      toISO: new Date(to).toISOString(),
      label: String(year),
      prevQS: `p=year&y=${year - 1}`,
      nextQS: `p=year&y=${year + 1}`,
      customFrom: mskDateKey(from),
      customTo: mskDateKey(to - DAY_MS),
    };
  }

  if (params.p === "custom") {
    const okFrom = params.from && DATE_RE.test(params.from) ? params.from : null;
    const okTo = params.to && DATE_RE.test(params.to) ? params.to : null;
    if (okFrom && okTo && okFrom <= okTo) {
      const from = mskDateStartMs(okFrom);
      const to = mskDateStartMs(okTo) + DAY_MS; // обе даты включительно
      return {
        kind: "custom",
        fromISO: new Date(from).toISOString(),
        toISO: new Date(to).toISOString(),
        label: `${mskDMY(from)} — ${mskDMY(to - DAY_MS)}`,
        prevQS: null,
        nextQS: null,
        customFrom: okFrom,
        customTo: okTo,
      };
    }
    // Некорректный диапазон — форма открыта, данные за текущий месяц.
    const monthKey = mskMonthKey(nowISO);
    const { fromISO, toISO } = monthRangeUtc(monthKey);
    return {
      kind: "custom",
      fromISO,
      toISO,
      label: monthLabelRu(monthKey),
      prevQS: null,
      nextQS: null,
      customFrom: mskDateKey(new Date(fromISO).getTime()),
      customTo: mskDateKey(new Date(toISO).getTime() - DAY_MS),
    };
  }

  // Дефолт — месяц (обратная совместимость с ?m=YYYY-MM).
  const monthKey = params.m && MONTH_RE.test(params.m) ? params.m : mskMonthKey(nowISO);
  const { fromISO, toISO } = monthRangeUtc(monthKey);
  return {
    kind: "month",
    fromISO,
    toISO,
    label: monthLabelRu(monthKey),
    prevQS: `p=month&m=${shiftMonthKey(monthKey, -1)}`,
    nextQS: `p=month&m=${shiftMonthKey(monthKey, 1)}`,
    customFrom: mskDateKey(new Date(fromISO).getTime()),
    customTo: mskDateKey(new Date(toISO).getTime() - DAY_MS),
  };
}

export interface ChartBucket {
  key: string; // "YYYY-MM-DD" (день) или "YYYY-MM" (месяц)
  label: string;
  charged: number;
  received: number;
}

const MONTHS_RU_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// Раскладывает леджер по бакетам графика: по дням для коротких диапазонов, по месяцам
// для длинных. Charge с занятием датируется занятием (effectiveDate) — как в сводке.
export function buildChartBuckets(entries: BillingEntry[], fromISO: string, toISO: string): ChartBucket[] {
  const fromMs = new Date(fromISO).getTime();
  const toMs = new Date(toISO).getTime();
  const spanDays = Math.round((toMs - fromMs) / DAY_MS);
  const daily = spanDays <= MAX_DAILY_BUCKETS;

  const buckets: ChartBucket[] = [];
  const index = new Map<string, ChartBucket>();
  if (daily) {
    for (let ms = fromMs; ms < toMs; ms += DAY_MS) {
      const b = { key: mskDateKey(ms), label: mskDM(ms), charged: 0, received: 0 };
      buckets.push(b);
      index.set(b.key, b);
    }
  } else {
    const lastKey = mskMonthKey(new Date(toMs - 1).toISOString());
    let key = mskMonthKey(fromISO);
    const multiYear = key.slice(0, 4) !== lastKey.slice(0, 4);
    while (key <= lastKey) {
      const [y, m] = key.split("-").map(Number);
      const label = multiYear ? `${MONTHS_RU_SHORT[m - 1]} ’${String(y).slice(2)}` : MONTHS_RU_SHORT[m - 1];
      const b = { key, label, charged: 0, received: 0 };
      buckets.push(b);
      index.set(key, b);
      key = shiftMonthKey(key, 1);
    }
  }

  for (const e of entries) {
    const effMs = new Date(effectiveDate(e)).getTime();
    if (effMs < fromMs || effMs >= toMs) continue;
    const key = daily ? mskDateKey(effMs) : mskMonthKey(new Date(effMs).toISOString());
    const b = index.get(key);
    if (!b) continue;
    if (e.type === "charge") b.charged += e.amount;
    else b.received += e.amount;
  }

  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const b of buckets) {
    b.charged = r2(b.charged);
    b.received = r2(b.received);
  }
  return buckets;
}
