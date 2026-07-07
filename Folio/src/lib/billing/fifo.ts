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
        status: e.type === "charge" && e.amount > 0 ? (a?.status ?? "debt") : null,
        covered: a ? toRub(a.coveredKop) : 0,
        cancelled: e.lesson?.status === "cancelled",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return { rows, debt: toRub(debtKop), advance: toRub(pool), oldestDebtDate, paidUpTo };
}
