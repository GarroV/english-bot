# Деньги v2 — Implementation Plan (цепочка 1 из спеки)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Раздел «Деньги» становится финансовым центром: FIFO-статусы оплаты по занятиям, месячная сводка с аналитикой занятий, должники с возрастом долга, аванс, чипы сумм, «Напомнить об оплате», ручные начисления, поздние отмены.

**Architecture:** Вся новая логика — чистые функции в `Folio/src/lib/billing/` (FIFO-аллокация, месячная сводка, тексты напоминаний) с юнит-тестами; queries расширяются join'ом к занятиям; UI страницы `billing` пересобирается (сводка + карточки + история v2 + диалоги). Одна миграция: RPC поздней отмены + колонка реквизитов воркспейса.

**Tech Stack:** Next.js 16 (App Router, async searchParams), React 19, Supabase (RLS, plpgsql RPC), zod, vitest, next-intl.

**Spec:** `Folio/docs/superpowers/specs/2026-07-07-folio-money-v2-cabinet-engagement-design.md` (раздел А).

## Global Constraints

- Рабочая директория UI/lib: `Folio/` (пути ниже — от корня репо). Тесты: `cd Folio && npm run test`. Type-check: `cd Folio && npx tsc --noEmit`. Сборка: `cd Folio && npm run build`.
- Деньги в БД — `numeric(10,2)`; в TS считать в **копейках** (integer) внутри FIFO, наружу — рубли (number). Сравнение float-остатка — только после `Math.round(x*100)`.
- Даты форматирует существующий `formatDate` (`Folio/src/lib/format/date.ts`) — `дд.мм.гг`, детерминированный.
- Таймзона продукта — Europe/Moscow (как в `src/lib/dashboard/derive.ts`).
- i18n: каждый новый ключ — сразу в `Folio/messages/ru.json` И `Folio/messages/en.json`, в секцию `Billing` (или `Schedule` для поздней отмены).
- Не коммитить в `main`; ветка `feat/folio-money-v2`, conventional commits `feat(folio): …`.
- Миграция — файл `supabase/migrations/<timestamp>_folio_money_v2.sql`, применяется `supabase db push` (project-ref `btlglelwxazdxfqdmcti`), после — обновить `Folio/docs/DATA_MODEL.md`.
- Инвариант леджера: `type='charge'` c `lesson_id` ⇔ занятие completed **ИЛИ** (новое) cancelled-с-начислением-за-отмену; `type='payment'` — `lesson_id IS NULL`; ручные начисления — `charge` c `lesson_id IS NULL` (скидка = отрицательная сумма).

---

### Task 1: FIFO-аллокация (ядро)

**Files:**
- Create: `Folio/src/lib/billing/fifo.ts`
- Test: `Folio/src/lib/billing/__tests__/fifo.test.ts`

**Interfaces:**
- Consumes: ничего (чистый модуль).
- Produces (используют Task 3, 7, 8):

```ts
export type ChargeStatus = "paid" | "partial" | "debt";
export interface BillingEntry {           // строка леджера, обогащённая занятием
  id: string;
  type: "charge" | "payment";
  amount: number;                          // рубли; charge может быть отрицательным (скидка)
  note: string | null;
  created_at: string;                      // ISO
  lesson: { scheduled_at: string; status: string } | null; // null у payment и ручных
}
export interface HistoryRow {
  kind: "lesson_charge" | "manual_charge" | "payment";
  id: string;
  date: string;                            // ISO: занятие → scheduled_at, иначе created_at
  amount: number;                          // рубли, знак сохраняется
  note: string | null;
  status: ChargeStatus | null;             // только у lesson_charge
  covered: number;                         // рубли, покрыто кредитом (для partial)
  cancelled: boolean;                      // charge отменённого занятия (бейдж «отмена»)
}
export interface StudentBilling {
  rows: HistoryRow[];                      // новые сверху
  debt: number;                            // рубли, суммарно не покрыто
  advance: number;                          // рубли, остаток кредита
  oldestDebtDate: string | null;           // ISO даты самого старого неоплаченного
  paidUpTo: string | null;                 // ISO даты последнего полностью оплаченного занятия
}
export function buildStudentBilling(entries: BillingEntry[]): StudentBilling;
```

- [ ] **Step 1: Написать падающий тест**

`Folio/src/lib/billing/__tests__/fifo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStudentBilling, type BillingEntry } from "../fifo";

let n = 0;
const id = () => `e${++n}`;
const lessonCharge = (amount: number, day: string, status = "completed"): BillingEntry => ({
  id: id(), type: "charge", amount, note: null, created_at: `${day}T12:00:00Z`,
  lesson: { scheduled_at: `${day}T10:00:00Z`, status },
});
const payment = (amount: number, day: string): BillingEntry => ({
  id: id(), type: "payment", amount, note: null, created_at: `${day}T12:00:00Z`, lesson: null,
});
const manual = (amount: number, day: string, note = "учебник"): BillingEntry => ({
  id: id(), type: "charge", amount, note, created_at: `${day}T12:00:00Z`, lesson: null,
});

describe("buildStudentBilling — FIFO", () => {
  it("платёж гасит занятия от старых к новым; хвост — частично; остальное — долг", () => {
    const r = buildStudentBilling([
      lessonCharge(700, "2026-06-12"),
      lessonCharge(700, "2026-06-19"),
      lessonCharge(700, "2026-06-26"),
      payment(1100, "2026-06-15"),
    ]);
    const lessons = r.rows.filter((x) => x.kind === "lesson_charge");
    // rows новые сверху → последний элемент = самое старое занятие
    expect(lessons.map((x) => x.status)).toEqual(["debt", "partial", "paid"]);
    const partial = lessons[1];
    expect(partial.covered).toBe(400);
    expect(r.debt).toBe(1000);
    expect(r.advance).toBe(0);
    expect(r.oldestDebtDate).toBe("2026-06-19T10:00:00Z");
    expect(r.paidUpTo).toBe("2026-06-12T10:00:00Z");
  });

  it("переплата → advance, долга нет", () => {
    const r = buildStudentBilling([lessonCharge(700, "2026-06-12"), payment(2000, "2026-06-15")]);
    expect(r.debt).toBe(0);
    expect(r.advance).toBe(1300);
    expect(r.oldestDebtDate).toBeNull();
  });

  it("скидка (отрицательный charge) работает как кредит; доплата — как обычное начисление", () => {
    const r = buildStudentBilling([
      lessonCharge(700, "2026-06-12"),
      manual(500, "2026-06-13", "доплата за длительность"),
      manual(-200, "2026-06-14", "скидка"),
    ]);
    // кредит 200 гасит старейший charge частично
    const rows = [...r.rows].reverse(); // старые сначала
    expect(rows[0].status).toBe("partial");
    expect(rows[0].covered).toBe(200);
    expect(r.debt).toBe(1000);
  });

  it("ручные начисления сортируются по created_at среди занятий по scheduled_at", () => {
    const r = buildStudentBilling([
      lessonCharge(700, "2026-06-20"),
      manual(300, "2026-06-10"),
      payment(300, "2026-06-11"),
    ]);
    const rows = [...r.rows].reverse();
    expect(rows[0].kind).toBe("manual_charge"); // 10.06 раньше 20.06
    expect(rows[0].status).toBe("paid");
    expect(r.debt).toBe(700);
  });

  it("charge отменённого занятия помечен cancelled и участвует в FIFO", () => {
    const r = buildStudentBilling([lessonCharge(350, "2026-06-12", "cancelled")]);
    expect(r.rows[0].cancelled).toBe(true);
    expect(r.debt).toBe(350);
  });

  it("копейки не плывут: 3×33.33 против 99.99", () => {
    const r = buildStudentBilling([
      lessonCharge(33.33, "2026-06-01"), lessonCharge(33.33, "2026-06-02"), lessonCharge(33.33, "2026-06-03"),
      payment(99.99, "2026-06-04"),
    ]);
    expect(r.debt).toBe(0);
    expect(r.advance).toBe(0);
  });

  it("пустой леджер", () => {
    const r = buildStudentBilling([]);
    expect(r).toEqual({ rows: [], debt: 0, advance: 0, oldestDebtDate: null, paidUpTo: null });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/fifo.test.ts`
Expected: FAIL — `Cannot find module '../fifo'`.

- [ ] **Step 3: Реализация**

`Folio/src/lib/billing/fifo.ts`:

```ts
// FIFO-аллокация платежей на начисления: статус оплаты каждого занятия вычисляется на чтении,
// в данных привязки платёж↔занятие нет (решение спеки 2026-07-07, раздел А1).

export type ChargeStatus = "paid" | "partial" | "debt";

export interface BillingEntry {
  id: string;
  type: "charge" | "payment";
  amount: number;
  note: string | null;
  created_at: string;
  lesson: { scheduled_at: string; status: string } | null;
}

export interface HistoryRow {
  kind: "lesson_charge" | "manual_charge" | "payment";
  id: string;
  date: string;
  amount: number;
  note: string | null;
  status: ChargeStatus | null;
  covered: number;
  cancelled: boolean;
}

export interface StudentBilling {
  rows: HistoryRow[];
  debt: number;
  advance: number;
  oldestDebtDate: string | null;
  paidUpTo: string | null;
}

const toKop = (rub: number) => Math.round(rub * 100);
const toRub = (kop: number) => kop / 100;

// Эффективная дата строки: у charge с занятием — дата занятия, иначе дата записи.
const effectiveDate = (e: BillingEntry) => (e.type === "charge" && e.lesson ? e.lesson.scheduled_at : e.created_at);

// Раскладывает леджер одного ученика: кредитный пул (платежи + скидки) гасит положительные
// начисления от старых к новым; максимум одно занятие получается partial.
export function buildStudentBilling(entries: BillingEntry[]): StudentBilling {
  const positiveCharges = entries
    .filter((e) => e.type === "charge" && e.amount > 0)
    .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)));
  const creditKop = entries.reduce((sum, e) => {
    if (e.type === "payment") return sum + toKop(e.amount);
    if (e.amount < 0) return sum + toKop(-e.amount);
    return sum;
  }, 0);

  let pool = creditKop;
  let debtKop = 0;
  let oldestDebtDate: string | null = null;
  let paidUpTo: string | null = null;
  const alloc = new Map<string, { status: ChargeStatus; coveredKop: number }>();

  for (const c of positiveCharges) {
    const amountKop = toKop(c.amount);
    const coveredKop = Math.min(pool, amountKop);
    pool -= coveredKop;
    const status: ChargeStatus = coveredKop === amountKop ? "paid" : coveredKop > 0 ? "partial" : "debt";
    alloc.set(c.id, { status, coveredKop });
    if (status === "paid" && c.lesson) paidUpTo = c.lesson.scheduled_at;
    if (status !== "paid") {
      debtKop += amountKop - coveredKop;
      if (oldestDebtDate === null) oldestDebtDate = effectiveDate(c);
    }
  }

  const rows: HistoryRow[] = entries
    .map((e): HistoryRow => {
      const a = alloc.get(e.id);
      return {
        kind: e.type === "payment" ? "payment" : e.lesson ? "lesson_charge" : "manual_charge",
        id: e.id,
        date: effectiveDate(e),
        amount: e.amount,
        note: e.note,
        status: e.type === "charge" && e.amount > 0 && e.lesson ? (a?.status ?? "debt") : null,
        covered: a ? toRub(a.coveredKop) : 0,
        cancelled: e.lesson?.status === "cancelled",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return { rows, debt: toRub(debtKop), advance: toRub(pool), oldestDebtDate, paidUpTo };
}
```

- [ ] **Step 4: Тест зелёный**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/fifo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add Folio/src/lib/billing/fifo.ts Folio/src/lib/billing/__tests__/fifo.test.ts
git commit -m "feat(folio): FIFO-аллокация платежей на занятия (статусы оплачено/частично/в долгу)"
```

---

### Task 2: Тексты «Напомнить об оплате» и «Выписка за месяц»

**Files:**
- Create: `Folio/src/lib/billing/reminder.ts`
- Test: `Folio/src/lib/billing/__tests__/reminder.test.ts`

**Interfaces:**
- Consumes: `HistoryRow` из `./fifo` (Task 1).
- Produces (используют Task 8/9):

```ts
export function buildReminderMessage(studentName: string, rows: HistoryRow[], details: string | null): string;
export function buildMonthStatement(studentName: string, monthLabel: string, rows: HistoryRow[], details: string | null): string;
```

- [ ] **Step 1: Падающий тест**

`Folio/src/lib/billing/__tests__/reminder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReminderMessage, buildMonthStatement } from "../reminder";
import type { HistoryRow } from "../fifo";

const row = (over: Partial<HistoryRow>): HistoryRow => ({
  kind: "lesson_charge", id: "x", date: "2026-06-12T10:00:00Z", amount: 700,
  note: null, status: "debt", covered: 0, cancelled: false, ...over,
});

describe("buildReminderMessage", () => {
  it("перечисляет неоплаченные занятия с датами, частичное — с остатком, и итог", () => {
    const msg = buildReminderMessage("Настя", [
      row({ status: "debt", date: "2026-06-19T10:00:00Z" }),
      row({ status: "partial", covered: 400, date: "2026-06-12T10:00:00Z" }),
      row({ status: "paid", date: "2026-06-05T10:00:00Z" }),
      row({ kind: "payment", status: null, amount: 400 }),
    ], "Сбер 1234");
    expect(msg).toContain("Настя");
    expect(msg).toContain("занятие от 19.06.26 — 700 ₽");
    expect(msg).toContain("занятие от 12.06.26 — осталось 300 ₽");
    expect(msg).not.toContain("05.06.26");
    expect(msg).toContain("Итого: 1 000 ₽");
    expect(msg).toContain("Сбер 1234");
  });
  it("без реквизитов — без блока реквизитов", () => {
    const msg = buildReminderMessage("Настя", [row({})], null);
    expect(msg).not.toContain("Реквизиты");
  });
});

describe("buildMonthStatement", () => {
  it("включает занятия месяца со статусами и платежи", () => {
    const msg = buildMonthStatement("Настя", "июнь 2026", [
      row({ status: "paid" }),
      row({ kind: "payment", status: null, amount: 700, date: "2026-06-15T09:00:00Z" }),
    ], null);
    expect(msg).toContain("июнь 2026");
    expect(msg).toContain("12.06.26");
    expect(msg).toContain("оплата 15.06.26 — 700 ₽");
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/reminder.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`Folio/src/lib/billing/reminder.ts`:

```ts
// Готовые тексты для отправки ученику: напоминание о долге и выписка за месяц.
// Копируются в буфер — никакой отправки из приложения (решение спеки А6).
import { formatDate } from "@/lib/format/date";
import type { HistoryRow } from "./fifo";

const fmtRub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;

// Неоплаченные lesson_charge строки → маркированный список + итог + реквизиты.
export function buildReminderMessage(studentName: string, rows: HistoryRow[], details: string | null): string {
  const unpaid = rows
    .filter((r) => r.kind === "lesson_charge" && (r.status === "debt" || r.status === "partial"))
    .sort((a, b) => a.date.localeCompare(b.date));
  const lines = unpaid.map((r) => {
    const remaining = Math.round((r.amount - r.covered) * 100) / 100;
    return r.status === "partial"
      ? `— занятие от ${formatDate(r.date)} — осталось ${fmtRub(remaining)}`
      : `— занятие от ${formatDate(r.date)} — ${fmtRub(r.amount)}`;
  });
  const total = unpaid.reduce((s, r) => s + (r.amount - r.covered), 0);
  const parts = [
    `Привет, ${studentName}! Напоминаю про оплату занятий:`,
    ...lines,
    `Итого: ${fmtRub(Math.round(total * 100) / 100)}`,
  ];
  if (details?.trim()) parts.push("", `Реквизиты: ${details.trim()}`);
  return parts.join("\n");
}

// Все строки истории (уже отфильтрованные по месяцу вызывающим кодом) → человекочитаемая выписка.
export function buildMonthStatement(studentName: string, monthLabel: string, rows: HistoryRow[], details: string | null): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map((r) => {
    if (r.kind === "payment") return `— оплата ${formatDate(r.date)} — ${fmtRub(r.amount)}`;
    const label = r.kind === "lesson_charge" ? `занятие от ${formatDate(r.date)}` : (r.note ?? "начисление");
    const status = r.status === "paid" ? "оплачено" : r.status === "partial" ? "частично" : r.status === "debt" ? "не оплачено" : "";
    return `— ${label} — ${fmtRub(r.amount)}${status ? ` (${status})` : ""}${r.cancelled ? " · отмена" : ""}`;
  });
  const parts = [`${studentName}, выписка за ${monthLabel}:`, ...lines];
  if (details?.trim()) parts.push("", `Реквизиты: ${details.trim()}`);
  return parts.join("\n");
}
```

- [ ] **Step 4: Тест зелёный**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/reminder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Folio/src/lib/billing/reminder.ts Folio/src/lib/billing/__tests__/reminder.test.ts
git commit -m "feat(folio): тексты напоминания об оплате и выписки за месяц"
```

---

### Task 3: Месячная сводка (чистые вычисления)

**Files:**
- Create: `Folio/src/lib/billing/summary.ts`
- Test: `Folio/src/lib/billing/__tests__/summary.test.ts`

**Interfaces:**
- Consumes: `BillingEntry` из `./fifo`.
- Produces (используют Task 4/7):

```ts
export interface MonthLesson {
  id: string;
  scheduled_at: string;
  status: string;                                       // scheduled | completed | cancelled
  participants: { rate_override: number | null; default_rate: number | null }[];
}
export interface MonthSummary {
  charged: number; received: number;
  lessonsCompleted: number; lessonsCancelled: number; lessonsUpcoming: number;
  forecastCount: number; forecastAmount: number;
}
export function mskMonthKey(iso: string): string;                       // "2026-07"
export function monthRangeUtc(monthKey: string): { fromISO: string; toISO: string };
export function shiftMonthKey(monthKey: string, delta: number): string; // "2026-07",-1 → "2026-06"
export function monthLabelRu(monthKey: string): string;                 // "июль 2026"
export function buildMonthSummary(entries: BillingEntry[], lessons: MonthLesson[], monthKey: string, nowISO: string): MonthSummary;
```

- [ ] **Step 1: Падающий тест**

`Folio/src/lib/billing/__tests__/summary.test.ts`:

```ts
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
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/summary.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`Folio/src/lib/billing/summary.ts`:

```ts
// Месячная сводка «Денег»: заработано/получено, раскладка занятий, прогноз до конца месяца.
// Месяц определяется по Москве (UTC+3, без DST) — как весь продукт.
import type { BillingEntry } from "./fifo";
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

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export function monthLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_RU[m - 1]} ${y}`;
}

const inMonth = (iso: string, monthKey: string) => mskMonthKey(iso) === monthKey;

export function buildMonthSummary(entries: BillingEntry[], lessons: MonthLesson[], monthKey: string, nowISO: string): MonthSummary {
  let charged = 0;
  let received = 0;
  for (const e of entries) {
    const eff = e.type === "charge" && e.lesson ? e.lesson.scheduled_at : e.created_at;
    if (!inMonth(eff, monthKey)) continue;
    if (e.type === "charge") charged += e.amount;
    else received += e.amount;
  }

  let lessonsCompleted = 0, lessonsCancelled = 0, lessonsUpcoming = 0, forecastCount = 0, forecastAmount = 0;
  const now = new Date(nowISO).getTime();
  for (const l of lessons) {
    if (!inMonth(l.scheduled_at, monthKey)) continue;
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
```

- [ ] **Step 4: Тест зелёный**

Run: `cd Folio && npx vitest run src/lib/billing/__tests__/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Folio/src/lib/billing/summary.ts Folio/src/lib/billing/__tests__/summary.test.ts
git commit -m "feat(folio): вычисление месячной сводки денег (заработано/получено/занятия/прогноз)"
```

---

### Task 4: Расширение queries (join к занятиям, ставки, занятия месяца)

**Files:**
- Modify: `Folio/src/lib/billing/queries.ts` (полная замена содержимого — ниже)

**Interfaces:**
- Consumes: типы `BillingEntry` (Task 1), `MonthLesson` (Task 3).
- Produces (используют Task 7):

```ts
export interface Balance { student_id: string; name: string; charged: number; paid: number; balance: number; default_rate: number | null; }
export async function listBalances(): Promise<Balance[]>;                       // + default_rate
export async function listBillingEntries(): Promise<(BillingEntry & { student_id: string })[]>; // с join занятия
export async function listMonthLessons(fromISO: string, toISO: string): Promise<MonthLesson[]>;
export async function getPaymentDetails(): Promise<string | null>;              // реквизиты воркспейса
```

`LedgerEntry`/`listLedgerEntries` удаляются (единственный потребитель — страница billing, перепишется в Task 7).

- [ ] **Step 1: Переписать файл**

`Folio/src/lib/billing/queries.ts` (новое содержимое целиком):

```ts
import { createClient } from "@/lib/supabase/server";
import type { BillingEntry } from "./fifo";
import type { MonthLesson } from "./summary";

export interface Balance {
  student_id: string;
  name: string;
  charged: number;
  paid: number;
  balance: number;
  default_rate: number | null;
}

// Per active student: totals + default_rate (нужна для «аванс ≈ N занятий» и чипов сумм).
export async function listBalances(): Promise<Balance[]> {
  const supabase = await createClient();
  const [studentsRes, entriesRes] = await Promise.all([
    supabase.from("folio_students").select("id, name, default_rate").is("archived_at", null).order("name", { ascending: true }),
    supabase.from("folio_student_payments").select("student_id, amount, type"),
  ]);
  if (studentsRes.error) throw new Error(`listBalances students: ${studentsRes.error.message}`);
  if (entriesRes.error) throw new Error(`listBalances entries: ${entriesRes.error.message}`);

  const agg = new Map<string, { charged: number; paid: number }>();
  for (const e of (entriesRes.data as { student_id: string; amount: number | string; type: string }[]) ?? []) {
    const a = agg.get(e.student_id) ?? { charged: 0, paid: 0 };
    if (e.type === "charge") a.charged += Number(e.amount);
    else a.paid += Number(e.amount);
    agg.set(e.student_id, a);
  }
  return ((studentsRes.data as { id: string; name: string; default_rate: number | string | null }[]) ?? []).map((s) => {
    const a = agg.get(s.id) ?? { charged: 0, paid: 0 };
    return {
      student_id: s.id, name: s.name, charged: a.charged, paid: a.paid,
      balance: a.charged - a.paid, default_rate: s.default_rate == null ? null : Number(s.default_rate),
    };
  });
}

// Весь леджер (RLS-scoped) с датой/статусом занятия у charges — сырьё для FIFO (fifo.ts).
export async function listBillingEntries(): Promise<(BillingEntry & { student_id: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_student_payments")
    .select("id, student_id, type, amount, note, created_at, folio_lessons(scheduled_at, status)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listBillingEntries failed: ${error.message}`);
  type Raw = {
    id: string; student_id: string; type: "charge" | "payment"; amount: number | string;
    note: string | null; created_at: string;
    folio_lessons: { scheduled_at: string; status: string } | { scheduled_at: string; status: string }[] | null;
  };
  return ((data as Raw[]) ?? []).map((r) => {
    const l = Array.isArray(r.folio_lessons) ? r.folio_lessons[0] ?? null : r.folio_lessons;
    return {
      id: r.id, student_id: r.student_id, type: r.type, amount: Number(r.amount),
      note: r.note, created_at: r.created_at, lesson: l,
    };
  });
}

// Занятия диапазона (месяц по Москве → UTC-границы из summary.monthRangeUtc) со ставками ростера.
export async function listMonthLessons(fromISO: string, toISO: string): Promise<MonthLesson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_lessons")
    .select("id, scheduled_at, status, folio_lesson_students(rate_override, folio_students(default_rate))")
    .gte("scheduled_at", fromISO)
    .lt("scheduled_at", toISO);
  if (error) throw new Error(`listMonthLessons failed: ${error.message}`);
  type Raw = {
    id: string; scheduled_at: string; status: string;
    folio_lesson_students: {
      rate_override: number | string | null;
      folio_students: { default_rate: number | string | null } | { default_rate: number | string | null }[] | null;
    }[];
  };
  return ((data as Raw[]) ?? []).map((l) => ({
    id: l.id, scheduled_at: l.scheduled_at, status: l.status,
    participants: (l.folio_lesson_students ?? []).map((p) => {
      const s = Array.isArray(p.folio_students) ? p.folio_students[0] ?? null : p.folio_students;
      return {
        rate_override: p.rate_override == null ? null : Number(p.rate_override),
        default_rate: s?.default_rate == null ? null : Number(s.default_rate),
      };
    }),
  }));
}

// Реквизиты для «Напомнить об оплате» — текстовое поле воркспейса (payment_details, Task 5).
export async function getPaymentDetails(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("folio_workspaces").select("payment_details").maybeSingle();
  if (error) throw new Error(`getPaymentDetails failed: ${error.message}`);
  return (data?.payment_details as string | null) ?? null;
}
```

- [ ] **Step 2: Type-check (упадёт на потребителях старого API — это ожидаемо, чинится в Task 7)**

Run: `cd Folio && npx tsc --noEmit 2>&1 | head -20`
Expected: ошибки ТОЛЬКО в `billing/page.tsx` и `BalancesList.tsx` (старые `LedgerEntry`/`listLedgerEntries`) и в `dashboard` нет. Если ошибки где-то ещё — разобраться перед коммитом. НЕ коммитить, пока не выполнен Task 7? — Нет: чтобы коммиты оставались зелёными, Task 4 коммитится ВМЕСТЕ с Task 7 (см. Task 7 Step 6). До тех пор — не коммитить.

> Примечание для исполнителя: `getPaymentDetails` обращается к колонке из Task 5. Задачи 4–7 сливаются в рабочее состояние только после Task 5 (миграция применена) — порядок выполнения: 1,2,3,5,6,4,7,8,9,10 допустим; главное — коммитить только компилируемое.

---

### Task 5: Миграция — RPC поздней отмены + реквизиты воркспейса

**Files:**
- Create: `supabase/migrations/20260707120000_folio_money_v2.sql`
- Modify: `Folio/src/lib/lessons/actions.ts` (добавить `cancelLessonLate`)
- Modify: `Folio/docs/DATA_MODEL.md` (колонка + RPC — найти секции `folio_workspaces` и список RPC, добавить строки)

**Interfaces:**
- Produces: RPC `folio_cancel_lesson_with_charge(p_lesson_id uuid, p_fraction numeric)`; колонка `folio_workspaces.payment_details text`; server action `cancelLessonLate(id: string, fraction: 0.5 | 1): Promise<ActionResult>` (использует Task 10).

- [ ] **Step 1: Написать миграцию**

`supabase/migrations/20260707120000_folio_money_v2.sql`:

```sql
-- Деньги v2 (спека 2026-07-07):
-- 1) Реквизиты для кнопки «Напомнить об оплате» — простое текстовое поле воркспейса.
-- 2) Поздняя отмена с начислением: отмена занятия + charge за отмену в ОДНОЙ транзакции.
--    Ослабляет инвариант «charge ⇔ completed»: charge может висеть на cancelled-занятии,
--    UI отличает его по статусу занятия (join), отдельного типа не нужно.

alter table folio_workspaces add column if not exists payment_details text;

-- Отмена занятия с начислением доли ставки (0 < p_fraction <= 1) каждому ученику ростера.
-- SECURITY INVOKER: все statements под RLS вызывающего (изоляция воркспейса сохраняется).
create or replace function folio_cancel_lesson_with_charge(p_lesson_id uuid, p_fraction numeric)
returns void
language plpgsql
as $$
declare
  v_ws uuid;
begin
  if p_fraction is null or p_fraction <= 0 or p_fraction > 1 then
    raise exception 'fraction must be in (0, 1]';
  end if;

  select workspace_id into v_ws from folio_lessons where id = p_lesson_id for update;
  if v_ws is null then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'cancelled', updated_at = now() where id = p_lesson_id;

  -- Пересоздаём charge этого занятия как «за отмену» (доля текущей ставки).
  delete from folio_student_payments where lesson_id = p_lesson_id and type = 'charge';
  insert into folio_student_payments (workspace_id, student_id, type, amount, lesson_id, note, created_by)
  select v_ws, ls.student_id, 'charge',
         round(coalesce(ls.rate_override, s.default_rate, 0) * p_fraction, 2),
         p_lesson_id, 'отмена', auth.uid()
  from folio_lesson_students ls
  join folio_students s on s.id = ls.student_id
  where ls.lesson_id = p_lesson_id;
end;
$$;
```

- [ ] **Step 2: Применить миграцию**

Run: `cd /Users/garva/Documents/projects/english-bot && supabase db push --project-ref btlglelwxazdxfqdmcti` (креды/линк — см. docs/ARCHITECTURE.md; НЕ перепутать project-ref).
Expected: `Applying migration 20260707120000_folio_money_v2.sql... Finished`.

- [ ] **Step 3: Добавить server action**

В конец `Folio/src/lib/lessons/actions.ts`:

```ts
// Поздняя отмена (<24 ч до начала): отменить занятие И начислить долю ставки — атомарно (RPC).
export async function cancelLessonLate(id: string, fraction: 0.5 | 1): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { error } = await supabase.rpc("folio_cancel_lesson_with_charge", { p_lesson_id: id, p_fraction: fraction });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 4: Обновить DATA_MODEL.md**

В `Folio/docs/DATA_MODEL.md`: в таблицу `folio_workspaces` добавить строку `payment_details text — реквизиты для напоминаний об оплате (Деньги v2)`; в раздел RPC — `folio_cancel_lesson_with_charge(p_lesson_id, p_fraction)` с одним предложением о назначении и заметкой об ослаблении инварианта «charge ⇔ completed» (charge за отмену живёт на cancelled-занятии).

- [ ] **Step 5: Type-check + commit**

Run: `cd Folio && npx tsc --noEmit 2>&1 | grep -v "billing/page\|BalancesList" | head` — ошибок вне известных мест нет.

```bash
git add supabase/migrations/20260707120000_folio_money_v2.sql Folio/src/lib/lessons/actions.ts Folio/docs/DATA_MODEL.md
git commit -m "feat(folio): миграция денег v2 — RPC поздней отмены с начислением + реквизиты воркспейса"
```

---

### Task 6: Ручное начисление и сохранение реквизитов (actions + schema)

**Files:**
- Modify: `Folio/src/lib/billing/schema.ts`
- Modify: `Folio/src/lib/billing/actions.ts`
- Test: `Folio/src/lib/billing/__tests__/billing.test.ts` (дополнить)

**Interfaces:**
- Produces (использует Task 9):

```ts
// schema.ts
export const chargeInputSchema: z.ZodType<{ studentId: string; amount: number; kind: "extra" | "discount"; note?: string }>;
export type ChargeInput = z.infer<typeof chargeInputSchema>;
// actions.ts
export async function recordCharge(input: ChargeInput): Promise<BillingResult>;      // скидка хранится с минусом
export async function savePaymentDetails(details: string): Promise<BillingResult>;
```

- [ ] **Step 1: Падающий тест (схема)**

Дописать в `Folio/src/lib/billing/__tests__/billing.test.ts`:

```ts
import { chargeInputSchema } from "../schema";

describe("chargeInputSchema", () => {
  it("принимает доплату и скидку с положительной суммой", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 500, kind: "extra", note: "учебник" }).success).toBe(true);
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 200, kind: "discount" }).success).toBe(true);
  });
  it("отклоняет ноль/отрицательные (знак ставит сервер, не форма)", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 0, kind: "extra" }).success).toBe(false);
    expect(chargeInputSchema.safeParse({ studentId: S, amount: -5, kind: "discount" }).success).toBe(false);
  });
  it("отклоняет неизвестный kind", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 5, kind: "bonus" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что падает** — `cd Folio && npx vitest run src/lib/billing/__tests__/billing.test.ts` → FAIL (нет экспорта).

- [ ] **Step 3: Реализация**

В `Folio/src/lib/billing/schema.ts` дописать:

```ts
// Ручное начисление: доплата (учебник, пробное) или разовая скидка. Сумма всегда вводится
// положительной — знак определяет kind (не-технарь не должен вводить минусы), минус ставит сервер.
export const chargeInputSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  kind: z.enum(["extra", "discount"]),
  note: z.string().trim().max(500).optional(),
});
export type ChargeInput = z.infer<typeof chargeInputSchema>;
```

В `Folio/src/lib/billing/actions.ts` дописать (импорт: `import { paymentInputSchema, chargeInputSchema, type PaymentInput, type ChargeInput } from "./schema";`):

```ts
// Ручное начисление вне занятий (lesson_id NULL): доплата +X / скидка −X (знак здесь).
export async function recordCharge(input: ChargeInput): Promise<BillingResult> {
  const parsed = chargeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_student_payments").insert({
    workspace_id: workspaceId,
    student_id: v.studentId,
    amount: v.kind === "discount" ? -v.amount : v.amount,
    type: "charge",
    note: v.note ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Реквизиты для напоминаний — одно текстовое поле воркспейса (RLS ограничивает своим).
export async function savePaymentDetails(details: string): Promise<BillingResult> {
  const trimmed = details.trim().slice(0, 1000);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_workspaces").update({ payment_details: trimmed || null }).not("id", "is", null).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
```

- [ ] **Step 4: Тест зелёный** — `cd Folio && npx vitest run src/lib/billing/__tests__/billing.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add Folio/src/lib/billing/schema.ts Folio/src/lib/billing/actions.ts Folio/src/lib/billing/__tests__/billing.test.ts
git commit -m "feat(folio): ручное начисление (доплата/скидка) и сохранение реквизитов"
```

---

### Task 7: Страница «Деньги» — сборка данных, месяц в URL, сводка

**Files:**
- Modify: `Folio/src/app/[locale]/(app)/billing/page.tsx` (полная замена)
- Create: `Folio/src/app/[locale]/(app)/billing/MonthSummaryCard.tsx`
- Modify: `Folio/messages/ru.json`, `Folio/messages/en.json` (секция `Billing` — ключи ниже)
- Modify: `Folio/src/lib/billing/queries.ts` — коммитится здесь же (Task 4)

**Interfaces:**
- Consumes: `buildStudentBilling` (Task 1), `buildMonthSummary`/`mskMonthKey`/`monthRangeUtc`/`shiftMonthKey`/`monthLabelRu` (Task 3), queries (Task 4).
- Produces: props-контракт для `StudentCards` (Task 8):

```ts
export interface StudentCardData {
  student_id: string; name: string;
  balance: number; debt: number; advance: number;
  advanceLessons: number | null;         // null если нет default_rate
  oldestDebtDays: number | null;
  paidUpTo: string | null;               // ISO
  defaultRate: number | null;
  rows: HistoryRow[];
}
```

- [ ] **Step 1: i18n-ключи**

В `Folio/messages/ru.json`, секция `Billing`, добавить (после `"noEntries"`):

```json
    "summaryCharged": "Заработано",
    "summaryReceived": "Получено",
    "summaryAwaiting": "Ждёт оплаты",
    "summaryLessons": "Занятия",
    "summaryLessonsLine": "{done} проведено · {cancelled} отменено · {upcoming} впереди",
    "summaryForecast": "ещё запланировано {count} занятий ≈ {amount}, если состоятся",
    "debtBadge": "должен {amount} · уже {days} дн.",
    "paidUpTo": "оплачено по занятие от {date}",
    "advanceBadge": "аванс {amount}",
    "advanceLessons": "≈ {count} занятий вперёд",
    "advanceRenew": "пора напомнить о продлении",
    "lessonFrom": "Занятие от {date}",
    "statusPaid": "оплачено",
    "statusPartial": "частично ({covered} из {amount})",
    "statusDebt": "в долгу",
    "cancelledBadge": "отмена",
    "extraCharge": "Доплата",
    "discount": "Скидка",
    "recordCharge": "Записать начисление",
    "chargeKindExtra": "Доплата",
    "chargeKindDiscount": "Скидка",
    "notePlaceholder": "учебник, пробное занятие…",
    "chipPayOffDebt": "Погасить долг ({amount})",
    "chipLessons": "{count} зан. ({amount})",
    "remind": "Напомнить",
    "remindCopied": "Сообщение скопировано — вставь ученику в чат",
    "remindDebt": "Напомнить о долге",
    "remindStatement": "Выписка за месяц",
    "paymentDetails": "Реквизиты для оплаты",
    "paymentDetailsHint": "Подставляются в сообщение-напоминание",
    "settings": "Реквизиты",
    "inDebtTotal": "В долгу: {amount} ({count})",
    "prepaidTotal": "Предоплачено: {amount} ({count})"
```

В `Folio/messages/en.json` — те же ключи с английскими значениями:

```json
    "summaryCharged": "Earned",
    "summaryReceived": "Received",
    "summaryAwaiting": "Awaiting payment",
    "summaryLessons": "Lessons",
    "summaryLessonsLine": "{done} completed · {cancelled} cancelled · {upcoming} upcoming",
    "summaryForecast": "{count} more lessons planned ≈ {amount}, if they happen",
    "debtBadge": "owes {amount} · {days} days now",
    "paidUpTo": "paid up to the lesson of {date}",
    "advanceBadge": "prepaid {amount}",
    "advanceLessons": "≈ {count} lessons ahead",
    "advanceRenew": "time to remind about renewal",
    "lessonFrom": "Lesson of {date}",
    "statusPaid": "paid",
    "statusPartial": "partial ({covered} of {amount})",
    "statusDebt": "unpaid",
    "cancelledBadge": "cancelled",
    "extraCharge": "Extra charge",
    "discount": "Discount",
    "recordCharge": "Record charge",
    "chargeKindExtra": "Extra",
    "chargeKindDiscount": "Discount",
    "notePlaceholder": "textbook, trial lesson…",
    "chipPayOffDebt": "Pay off debt ({amount})",
    "chipLessons": "{count} lsn ({amount})",
    "remind": "Remind",
    "remindCopied": "Message copied — paste it to the student",
    "remindDebt": "Remind about debt",
    "remindStatement": "Month statement",
    "paymentDetails": "Payment details",
    "paymentDetailsHint": "Inserted into the reminder message",
    "settings": "Details",
    "inDebtTotal": "In debt: {amount} ({count})",
    "prepaidTotal": "Prepaid: {amount} ({count})"
```

- [ ] **Step 2: Компонент сводки**

`Folio/src/app/[locale]/(app)/billing/MonthSummaryCard.tsx`:

```tsx
import { Link } from "@/i18n/navigation";
import type { MonthSummary } from "@/lib/billing/summary";

export interface SummaryLabels {
  charged: string; received: string; awaiting: string; lessons: string;
  lessonsLine: string; forecast: string;
}

const fmtRub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;

// Серверный презентационный блок: числа месяца + переключатель месяцев ссылками (?m=YYYY-MM).
export function MonthSummaryCard({ summary, awaiting, monthLabel, prevHref, nextHref, labels }: {
  summary: MonthSummary; awaiting: number; monthLabel: string;
  prevHref: string; nextHref: string; labels: SummaryLabels;
}) {
  const stats: [string, string, string][] = [
    [labels.charged, fmtRub(summary.charged), "text-foreground"],
    [labels.received, fmtRub(summary.received), "text-emerald-600 dark:text-emerald-400"],
    [labels.awaiting, fmtRub(awaiting), awaiting > 0 ? "text-destructive" : "text-foreground"],
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
```

- [ ] **Step 3: Переписать страницу**

`Folio/src/app/[locale]/(app)/billing/page.tsx` (целиком):

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBalances, listBillingEntries, listMonthLessons, getPaymentDetails } from "@/lib/billing/queries";
import { buildStudentBilling } from "@/lib/billing/fifo";
import { buildMonthSummary, mskMonthKey, monthRangeUtc, shiftMonthKey, monthLabelRu } from "@/lib/billing/summary";
import { MonthSummaryCard } from "./MonthSummaryCard";
import { StudentCards, type StudentCardData } from "./StudentCards";

const DAY_MS = 86_400_000;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const nowISO = new Date().toISOString();
  const { m } = await searchParams;
  const monthKey = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : mskMonthKey(nowISO);
  const { fromISO, toISO } = monthRangeUtc(monthKey);

  const [balances, entries, monthLessons, paymentDetails] = await Promise.all([
    listBalances(), listBillingEntries(), listMonthLessons(fromISO, toISO), getPaymentDetails(),
  ]);

  const summary = buildMonthSummary(entries, monthLessons, monthKey, nowISO);

  // FIFO по каждому ученику — на сервере; клиенту уходят только сериализуемые данные.
  const byStudent = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byStudent.get(e.student_id) ?? [];
    list.push(e);
    byStudent.set(e.student_id, list);
  }
  const now = new Date(nowISO).getTime();
  const cards: StudentCardData[] = balances.map((b) => {
    const st = buildStudentBilling(byStudent.get(b.student_id) ?? []);
    return {
      student_id: b.student_id, name: b.name, balance: b.balance,
      debt: st.debt, advance: st.advance,
      advanceLessons: b.default_rate && b.default_rate > 0 ? Math.floor(st.advance / b.default_rate) : null,
      oldestDebtDays: st.oldestDebtDate ? Math.max(0, Math.floor((now - new Date(st.oldestDebtDate).getTime()) / DAY_MS)) : null,
      paidUpTo: st.paidUpTo, defaultRate: b.default_rate, rows: st.rows,
    };
  });
  // Должники сверху (самый давний долг первым), затем аванс, затем нулевые.
  cards.sort((a, c) => {
    if (a.debt > 0 !== c.debt > 0) return a.debt > 0 ? -1 : 1;
    if (a.debt > 0 && c.debt > 0) return (c.oldestDebtDays ?? 0) - (a.oldestDebtDays ?? 0);
    if (a.advance > 0 !== c.advance > 0) return a.advance > 0 ? -1 : 1;
    return a.name.localeCompare(c.name, "ru");
  });

  const totalDebt = cards.reduce((s, x) => s + x.debt, 0);
  const debtors = cards.filter((x) => x.debt > 0).length;
  const totalAdvance = cards.reduce((s, x) => s + x.advance, 0);
  const prepaid = cards.filter((x) => x.advance > 0).length;

  const t = await getTranslations("Billing");
  const fmtRub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 p-4 sm:p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>

      <MonthSummaryCard
        summary={summary}
        awaiting={totalDebt}
        monthLabel={monthLabelRu(monthKey)}
        prevHref={`/billing?m=${shiftMonthKey(monthKey, -1)}`}
        nextHref={`/billing?m=${shiftMonthKey(monthKey, 1)}`}
        labels={{
          charged: t("summaryCharged"), received: t("summaryReceived"), awaiting: t("summaryAwaiting"),
          lessons: t("summaryLessons"),
          lessonsLine: t("summaryLessonsLine", { done: summary.lessonsCompleted, cancelled: summary.lessonsCancelled, upcoming: summary.lessonsUpcoming }),
          forecast: t("summaryForecast", { count: summary.forecastCount, amount: fmtRub(summary.forecastAmount) }),
        }}
      />

      <p className="text-sm text-muted-foreground">
        <span className={totalDebt > 0 ? "font-semibold text-destructive" : ""}>{t("inDebtTotal", { amount: fmtRub(totalDebt), count: debtors })}</span>
        {"  ·  "}
        <span className={totalAdvance > 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>{t("prepaidTotal", { amount: fmtRub(totalAdvance), count: prepaid })}</span>
      </p>

      <StudentCards
        cards={cards}
        monthKey={monthKey}
        monthLabel={monthLabelRu(monthKey)}
        paymentDetails={paymentDetails}
        labels={{
          recordPayment: t("recordPayment"), recordCharge: t("recordCharge"), amount: t("amount"),
          note: t("note"), save: t("save"), cancel: t("cancel"), saved: t("saved"), saveError: t("saveError"),
          empty: t("empty"), ledger: t("ledger"), hide: t("hide"), delete: t("delete"),
          payment: t("payment"), noEntries: t("noEntries"),
          debtBadge: t("debtBadge"), paidUpTo: t("paidUpTo"), advanceBadge: t("advanceBadge"),
          advanceLessons: t("advanceLessons"), advanceRenew: t("advanceRenew"),
          lessonFrom: t("lessonFrom"), statusPaid: t("statusPaid"), statusPartial: t("statusPartial"),
          statusDebt: t("statusDebt"), cancelledBadge: t("cancelledBadge"),
          extraCharge: t("extraCharge"), discount: t("discount"),
          chargeKindExtra: t("chargeKindExtra"), chargeKindDiscount: t("chargeKindDiscount"),
          notePlaceholder: t("notePlaceholder"),
          chipPayOffDebt: t("chipPayOffDebt"), chipLessons: t("chipLessons"),
          remind: t("remind"), remindCopied: t("remindCopied"), remindDebt: t("remindDebt"),
          remindStatement: t("remindStatement"),
          paymentDetails: t("paymentDetails"), paymentDetailsHint: t("paymentDetailsHint"), settings: t("settings"),
        }}
      />
    </main>
  );
}
```

> Плейсхолдеры `{amount}`/`{days}`/`{date}`/`{covered}`/`{count}` в некоторых ключах интерполируются НЕ здесь, а в `StudentCards` (клиент) — поэтому такие ключи передаются как raw-шаблоны через `t.raw`? Нет: next-intl не сериализует функции. Решение: в `StudentCards` передаём готовые строки-шаблоны c плейсхолдерами `{...}` (как выше через `t("debtBadge")` НЕ сработает — next-intl бросит ошибку о недостающих значениях). Поэтому в page.tsx для ключей с плейсхолдерами использовать `t.raw("debtBadge")` и т.д.; в `StudentCards` — простая функция `fill(tpl, vars)` (Task 8). Исполнителю: заменить `t("X")` на `t.raw("X")` для ключей: debtBadge, paidUpTo, advanceLessons, lessonFrom, statusPartial, chipPayOffDebt, chipLessons.

- [ ] **Step 4: Type-check**

Run: `cd Folio && npx tsc --noEmit`
Expected: ошибки только про отсутствующий `./StudentCards` (создаётся в Task 8). Продолжить в Task 8; коммит совместный там же.

---

### Task 8: StudentCards — карточки, история v2

**Files:**
- Create: `Folio/src/app/[locale]/(app)/billing/StudentCards.tsx`
- Delete: `Folio/src/app/[locale]/(app)/billing/BalancesList.tsx`

**Interfaces:**
- Consumes: `StudentCardData` (Task 7), `HistoryRow` (Task 1), `buildReminderMessage`/`buildMonthStatement` (Task 2), actions `recordPayment`/`recordCharge`/`deleteEntry`/`savePaymentDetails` (Task 6), `mskMonthKey` (Task 3).
- Produces: клиентский компонент `StudentCards` (используется только страницей).

- [ ] **Step 1: Реализация**

`Folio/src/app/[locale]/(app)/billing/StudentCards.tsx` (целиком):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordPayment, recordCharge, deleteEntry, savePaymentDetails } from "@/lib/billing/actions";
import { buildReminderMessage, buildMonthStatement } from "@/lib/billing/reminder";
import { mskMonthKey } from "@/lib/billing/summary";
import type { HistoryRow } from "@/lib/billing/fifo";
import { formatDate } from "@/lib/format/date";

export interface StudentCardData {
  student_id: string; name: string;
  balance: number; debt: number; advance: number;
  advanceLessons: number | null;
  oldestDebtDays: number | null;
  paidUpTo: string | null;
  defaultRate: number | null;
  rows: HistoryRow[];
}

export interface CardLabels {
  recordPayment: string; recordCharge: string; amount: string; note: string; save: string; cancel: string;
  saved: string; saveError: string; empty: string; ledger: string; hide: string; delete: string;
  payment: string; noEntries: string;
  debtBadge: string; paidUpTo: string; advanceBadge: string; advanceLessons: string; advanceRenew: string;
  lessonFrom: string; statusPaid: string; statusPartial: string; statusDebt: string; cancelledBadge: string;
  extraCharge: string; discount: string; chargeKindExtra: string; chargeKindDiscount: string; notePlaceholder: string;
  chipPayOffDebt: string; chipLessons: string;
  remind: string; remindCopied: string; remindDebt: string; remindStatement: string;
  paymentDetails: string; paymentDetailsHint: string; settings: string;
}

const fmtRub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;
// Простая интерполяция raw-шаблонов next-intl ("{amount}" и т.п.) на клиенте.
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function StudentCards({ cards, monthKey, monthLabel, paymentDetails, labels }: {
  cards: StudentCardData[]; monthKey: string; monthLabel: string;
  paymentDetails: string | null; labels: CardLabels;
}) {
  const router = useRouter();
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<StudentCardData | null>(null);
  const [chargeFor, setChargeFor] = useState<StudentCardData | null>(null);
  const [remindFor, setRemindFor] = useState<StudentCardData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState(paymentDetails ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"extra" | "discount">("extra");
  const [pending, setPending] = useState(false);

  const parseAmount = (s: string) => Number(s.trim().replace(",", "."));

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, close: () => void) {
    setPending(true);
    try {
      const res = await fn();
      if (res.ok) { toast.success(labels.saved); close(); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error ?? ""}`);
    } catch { toast.error(labels.saveError); } finally { setPending(false); }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success(labels.remindCopied); }
    catch { toast.error(labels.saveError); }
    setRemindFor(null);
  }

  if (cards.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setDetails(paymentDetails ?? ""); setDetailsOpen(true); }}>
          ⚙ {labels.settings}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {cards.map((c) => (
          <li key={c.student_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{c.name}</span>
              {c.debt > 0 && c.oldestDebtDays !== null && (
                <span className="rounded-full bg-destructive/12 px-2.5 py-0.5 text-xs font-bold text-destructive">
                  {fill(labels.debtBadge, { amount: fmtRub(c.debt), days: c.oldestDebtDays })}
                </span>
              )}
              {c.advance > 0 && (
                <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {fill(labels.advanceBadge, { amount: fmtRub(c.advance) })}
                  {c.advanceLessons !== null && c.advanceLessons > 0 && ` ${fill(labels.advanceLessons, { count: c.advanceLessons })}`}
                </span>
              )}
              {c.advance > 0 && c.advanceLessons !== null && c.advanceLessons <= 1 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">{labels.advanceRenew}</span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenLedger(openLedger === c.student_id ? null : c.student_id)}>
                  {openLedger === c.student_id ? labels.hide : labels.ledger}
                </Button>
                {c.debt > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setRemindFor(c)}>💬 {labels.remind}</Button>
                )}
                <Button size="sm" onClick={() => { setPayFor(c); setAmount(""); setNote(""); }}>{labels.recordPayment}</Button>
              </div>
            </div>
            {c.debt > 0 && c.paidUpTo && (
              <p className="mt-1 text-xs text-muted-foreground">{fill(labels.paidUpTo, { date: formatDate(c.paidUpTo) })}</p>
            )}

            {openLedger === c.student_id && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setChargeFor(c); setAmount(""); setNote(""); setKind("extra"); }}>
                    + {labels.recordCharge}
                  </Button>
                </div>
                {c.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{labels.noEntries}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {c.rows.map((r) => (
                      <li key={r.id} className={`flex items-center justify-between gap-2 ${r.kind === "payment" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        <span className="min-w-0 truncate">
                          {r.kind === "payment" && `${labels.payment} ${formatDate(r.date)} · ${fmtRub(r.amount)}${r.note ? ` · ${r.note}` : ""}`}
                          {r.kind === "lesson_charge" && (
                            <>
                              {fill(labels.lessonFrom, { date: formatDate(r.date) })} · {fmtRub(r.amount)} ·{" "}
                              <StatusBadge row={r} labels={labels} />
                              {r.cancelled && <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs">{labels.cancelledBadge}</span>}
                            </>
                          )}
                          {r.kind === "manual_charge" && `${r.amount < 0 ? labels.discount : labels.extraCharge} · ${fmtRub(Math.abs(r.amount))}${r.note ? ` · ${r.note}` : ""} · ${formatDate(r.date)}`}
                        </span>
                        <Button variant="ghost" size="sm" disabled={pending}
                          onClick={() => run(() => deleteEntry(r.id), () => {})}>
                          {labels.delete}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Оплата: чипы быстрых сумм */}
      <Dialog open={payFor !== null} onOpenChange={(o) => { if (!o) setPayFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordPayment}{payFor ? ` — ${payFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {payFor && (
              <div className="flex flex-wrap gap-1.5">
                {payFor.debt > 0 && (
                  <Chip active onClick={() => setAmount(String(payFor.debt))}>
                    {fill(labels.chipPayOffDebt, { amount: fmtRub(payFor.debt) })}
                  </Chip>
                )}
                {payFor.defaultRate != null && payFor.defaultRate > 0 && [1, 4, 8].map((n) => (
                  <Chip key={n} onClick={() => setAmount(String(n * payFor.defaultRate!))}>
                    {fill(labels.chipLessons, { count: n, amount: fmtRub(n * payFor.defaultRate!) })}
                  </Chip>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-amount">{labels.amount}</Label>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-note">{labels.note}</Label>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayFor(null)} disabled={pending}>{labels.cancel}</Button>
            <Button disabled={pending || !amount.trim() || !(parseAmount(amount) > 0)}
              onClick={() => payFor && run(
                () => recordPayment({ studentId: payFor.student_id, amount: parseAmount(amount), note: note.trim() || undefined }),
                () => setPayFor(null),
              )}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ручное начисление: доплата / скидка */}
      <Dialog open={chargeFor !== null} onOpenChange={(o) => { if (!o) setChargeFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordCharge}{chargeFor ? ` — ${chargeFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex gap-2">
              {(["extra", "discount"] as const).map((k) => (
                <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {k === "extra" ? labels.chargeKindExtra : labels.chargeKindDiscount}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ch-amount">{labels.amount}</Label>
              <Input id="ch-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ch-note">{labels.note}</Label>
              <Input id="ch-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={labels.notePlaceholder} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChargeFor(null)} disabled={pending}>{labels.cancel}</Button>
            <Button disabled={pending || !amount.trim() || !(parseAmount(amount) > 0)}
              onClick={() => chargeFor && run(
                () => recordCharge({ studentId: chargeFor.student_id, amount: parseAmount(amount), kind, note: note.trim() || undefined }),
                () => setChargeFor(null),
              )}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Напомнить: долг / выписка за месяц */}
      <Dialog open={remindFor !== null} onOpenChange={(o) => { if (!o) setRemindFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>💬 {labels.remind}{remindFor ? ` — ${remindFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" disabled={pending}
              onClick={() => remindFor && copyText(buildReminderMessage(remindFor.name, remindFor.rows, paymentDetails))}>
              {labels.remindDebt}
            </Button>
            <Button variant="outline" disabled={pending}
              onClick={() => remindFor && copyText(buildMonthStatement(
                remindFor.name, monthLabel,
                remindFor.rows.filter((r) => mskMonthKey(r.date) === monthKey),
                paymentDetails,
              ))}>
              {labels.remindStatement}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Реквизиты */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.paymentDetails}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            <p className="text-xs text-muted-foreground">{labels.paymentDetailsHint}</p>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000}
              className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailsOpen(false)} disabled={pending}>{labels.cancel}</Button>
            <Button disabled={pending} onClick={() => run(() => savePaymentDetails(details), () => setDetailsOpen(false))}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ row, labels }: { row: HistoryRow; labels: CardLabels }) {
  if (row.status === "paid") return <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ {labels.statusPaid}</span>;
  if (row.status === "partial") {
    return <span className="font-semibold text-amber-600 dark:text-amber-400">
      ◑ {fill(labels.statusPartial, { covered: fmtRub(row.covered), amount: fmtRub(row.amount) })}
    </span>;
  }
  return <span className="font-semibold text-destructive">✗ {labels.statusDebt}</span>;
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
      }`}>
      {children}
    </button>
  );
}
```

> `fill` объявлена до `StudentCards` и используется и в `StatusBadge` — обе функции в одном файле, хойстинга const-стрелок нет, поэтому `fill`/`fmtRub` должны стоять НАД компонентами (как в листинге).

- [ ] **Step 2: Удалить старый компонент**

```bash
git rm Folio/src/app/[locale]/(app)/billing/BalancesList.tsx
```

Проверить, что на него никто больше не ссылается: `grep -rn "BalancesList" Folio/src` → пусто.

- [ ] **Step 3: Type-check + все тесты**

Run: `cd Folio && npx tsc --noEmit && npm run test`
Expected: 0 ошибок; все тесты PASS.

- [ ] **Step 4: Сборка**

Run: `cd Folio && npm run build`
Expected: `✓ Compiled successfully` (обязательный гейт — tsc не ловит границу server/client, см. память folio-deploy-build-gate).

- [ ] **Step 5: Commit (Task 4 + 7 + 8 вместе — первая компилируемая точка UI)**

```bash
git add Folio/src/lib/billing/queries.ts "Folio/src/app/[locale]/(app)/billing/" Folio/messages/ru.json Folio/messages/en.json
git commit -m "feat(folio): страница «Деньги» v2 — сводка месяца, FIFO-история по занятиям, должники/аванс, чипы, напоминания"
```

---

### Task 9: Дашборд — QuickPaymentDialog не сломан, долги согласованы

**Files:**
- Modify: `Folio/src/app/[locale]/(app)/dashboard/page.tsx` (только если тип `Balance` вызвал ошибку — новое поле `default_rate` обратносовместимо, ошибок быть не должно)

- [ ] **Step 1: Проверить потребителей `listBalances`**

Run: `grep -rn "listBalances\|Balance\b" Folio/src --include="*.ts" --include="*.tsx" | grep -v billing/`
Expected: `dashboard/page.tsx` и `lib/dashboard/derive.ts` компилируются без правок (поле добавлено, ничего не удалено). Если tsc ругается — поправить импорты типов.

- [ ] **Step 2: Полный прогон**

Run: `cd Folio && npx tsc --noEmit && npm run test && npm run build`
Expected: всё зелёное. Если правок не было — commit не нужен.

---

### Task 10: Поздняя отмена в LessonDialog

**Files:**
- Modify: `Folio/src/app/[locale]/(app)/schedule/LessonDialog.tsx`
- Modify: `Folio/messages/ru.json`, `Folio/messages/en.json` (секция `Schedule`)
- Modify: `Folio/src/app/[locale]/(app)/schedule/page.tsx` (пробросить новые лейблы)

**Interfaces:**
- Consumes: `cancelLessonLate` (Task 5), `cancelLesson` (существующий).

- [ ] **Step 1: i18n-ключи**

`Folio/messages/ru.json` → `Schedule` (после `"journal"`):

```json
    "lateCancelTitle": "Отмена меньше чем за сутки",
    "lateCancelBody": "Начислить за позднюю отмену?",
    "lateCancelNone": "Не начислять",
    "lateCancelHalf": "50% ставки",
    "lateCancelFull": "100% ставки"
```

`Folio/messages/en.json` → `Schedule`:

```json
    "lateCancelTitle": "Cancelling less than a day ahead",
    "lateCancelBody": "Charge for the late cancellation?",
    "lateCancelNone": "No charge",
    "lateCancelHalf": "50% of rate",
    "lateCancelFull": "100% of rate"
```

- [ ] **Step 2: Логика в LessonDialog**

В `Folio/src/app/[locale]/(app)/schedule/LessonDialog.tsx`:

1. Импорт: `import { createLesson, updateLesson, cancelLesson, completeLesson, cancelLessonLate } from "@/lib/lessons/actions";`
2. В `interface Labels` добавить: `lateCancelTitle: string; lateCancelBody: string; lateCancelNone: string; lateCancelHalf: string; lateCancelFull: string;`
3. Состояние: `const [lateCancelOpen, setLateCancelOpen] = useState(false);`
4. Заменить кнопку отмены (строки ~183-185):

```tsx
// Было:
<Button variant="outline" size="sm" disabled={pending} onClick={() => runAction(cancelLesson)}>
  {labels.cancelLesson}
</Button>
// Стало:
<Button variant="outline" size="sm" disabled={pending} onClick={() => {
  const startsAt = state?.lesson ? new Date(state.lesson.scheduled_at).getTime() : 0;
  const isLate = state?.lesson?.status === "scheduled" && startsAt - Date.now() < 24 * 3_600_000 && startsAt > Date.now();
  if (isLate) setLateCancelOpen(true);
  else runAction(cancelLesson);
}}>
  {labels.cancelLesson}
</Button>
```

5. Внутри `<DialogContent>` (после `</DialogFooter>` перед закрывающим тегом) — инлайн-блок выбора (не вложенный Dialog — вложенные диалоги shadcn конфликтуют):

```tsx
{lateCancelOpen && (
  <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/8 p-3">
    <p className="text-sm font-semibold">{labels.lateCancelTitle}</p>
    <p className="mb-2 text-sm text-muted-foreground">{labels.lateCancelBody}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => { setLateCancelOpen(false); runAction(cancelLesson); }}>
        {labels.lateCancelNone}
      </Button>
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => { setLateCancelOpen(false); runAction((id) => cancelLessonLate(id, 0.5)); }}>
        {labels.lateCancelHalf}
      </Button>
      <Button size="sm" disabled={pending}
        onClick={() => { setLateCancelOpen(false); runAction((id) => cancelLessonLate(id, 1)); }}>
        {labels.lateCancelFull}
      </Button>
    </div>
  </div>
)}
```

6. При закрытии диалога сбрасывать: в существующем reset-блоке `else if (!open && seededFor !== null)` добавить `setLateCancelOpen(false);`.

- [ ] **Step 3: Пробросить лейблы**

В `Folio/src/app/[locale]/(app)/schedule/page.tsx` найти объект лейблов LessonDialog (передаётся как `labels`) и добавить:

```ts
lateCancelTitle: t("lateCancelTitle"), lateCancelBody: t("lateCancelBody"),
lateCancelNone: t("lateCancelNone"), lateCancelHalf: t("lateCancelHalf"), lateCancelFull: t("lateCancelFull"),
```

(где `t` — переводчик секции `Schedule`; сверить фактическое имя переменной в файле).

- [ ] **Step 4: Прогон + commit**

Run: `cd Folio && npx tsc --noEmit && npm run test && npm run build`
Expected: зелёное.

```bash
git add "Folio/src/app/[locale]/(app)/schedule/" Folio/messages/ru.json Folio/messages/en.json
git commit -m "feat(folio): поздняя отмена занятия — вопрос о начислении 0/50/100% ставки"
```

---

### Task 11: Финал — PR, деплой, смоук, доки

- [ ] **Step 1: Полный прогон** — `cd Folio && npx tsc --noEmit && npm run test && npm run build` → всё зелёное.
- [ ] **Step 2: Доки.** `Folio/docs/BACKLOG.md`: отметить реализованное (месячная сводка/аналитика денег — если упоминалось), сверить раздел «Временно скрыто» не задет. `Folio/docs/DATA_MODEL.md` уже обновлён в Task 5 — перепроверить.
- [ ] **Step 3: PR** — `gh pr create` с описанием по шаблону проекта (что/зачем/проверка), после ревью — merge (одобрение владельца).
- [ ] **Step 4: Деплой** — `cd Folio && npm run cf:deploy` (миграция уже применена в Task 5). Читать ХВОСТ лога, не exit-код под пайпом.
- [ ] **Step 5: Смоук в проде** — открыть `/ru/billing`: сводка месяца рендерится, история ученика «тест» показывает «Занятие от <дата> · … · статус», чипы в диалоге оплаты работают, «Напомнить» копирует текст. Отменить тестовое занятие в ближайшие 24 ч → появляется вопрос о начислении.

---

## Self-Review (выполнено при написании)

- **Spec coverage:** А1 (FIFO) → Task 1; А2 (история) → Task 8; А3 (сводка) → Tasks 3/7; А4 (карточка/сортировка/возраст долга/аванс) → Tasks 7/8; А5 (чипы) → Task 8; А6 (напомнить + реквизиты + выписка) → Tasks 2/5/6/8; А7 (ручное начисление, поздняя отмена) → Tasks 5/6/10; А8 (замена старой истории) → Task 8 (удаление BalancesList).
- **Убрано из объёма (соответствует спеке):** способ оплаты нал/перевод, налог самозанятого — «потом по желанию»; дашборд-виджет — цепочка 3.
- **Type consistency:** `BillingEntry`/`HistoryRow`/`StudentBilling` (Task 1) ↔ reminder (Task 2) ↔ queries (Task 4) ↔ page/StudentCards (Tasks 7/8) — имена сверены. `MonthLesson`/`MonthSummary` (Task 3) ↔ queries/page. `cancelLessonLate(id, fraction)` (Task 5) ↔ LessonDialog (Task 10).
- **Известная связка задач:** Task 4 компилируется только вместе с Task 7/8 (замена потребителей) — коммит объединён в Task 8 Step 5; Task 4 Step 2 прямо это говорит.
