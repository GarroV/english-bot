// Готовые тексты для отправки ученику: напоминание о долге и выписка за месяц.
// Копируются в буфер — никакой отправки из приложения (решение спеки А6).
import { formatDate } from "../format/date";
import { formatRub } from "../format/money";
import type { HistoryRow } from "./fifo";

// Неоплаченные lesson_charge и manual_charge строки → маркированный список + итог + реквизиты.
// Итог должен совпадать с реальным долгом (бейджем) — поэтому ручные начисления в долгу/частично тоже включены.
export function buildReminderMessage(studentName: string, rows: HistoryRow[], details: string | null): string {
  const unpaid = rows
    .filter((r) => (r.kind === "lesson_charge" || r.kind === "manual_charge") && (r.status === "debt" || r.status === "partial"))
    .sort((a, b) => a.date.localeCompare(b.date));
  const lines = unpaid.map((r) => {
    const remaining = Math.round((r.amount - r.covered) * 100) / 100;
    if (r.kind === "manual_charge") {
      const label = r.note ?? "начисление";
      return r.status === "partial"
        ? `— ${label}: осталось ${formatRub(remaining)}`
        : `— ${label}: ${formatRub(r.amount)}`;
    }
    return r.status === "partial"
      ? `— занятие от ${formatDate(r.date)} — осталось ${formatRub(remaining)}`
      : `— занятие от ${formatDate(r.date)} — ${formatRub(r.amount)}`;
  });
  const total = unpaid.reduce((s, r) => s + (r.amount - r.covered), 0);
  const parts = [
    `Привет, ${studentName}! Напоминаю про оплату занятий:`,
    ...lines,
    `Итого: ${formatRub(Math.round(total * 100) / 100)}`,
  ];
  if (details?.trim()) parts.push("", `Реквизиты: ${details.trim()}`);
  return parts.join("\n");
}

// Все строки истории (уже отфильтрованные по месяцу вызывающим кодом) → человекочитаемая выписка.
export function buildMonthStatement(studentName: string, monthLabel: string, rows: HistoryRow[], details: string | null): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map((r) => {
    if (r.kind === "payment") return `— оплата ${formatDate(r.date)} — ${formatRub(r.amount)}`;
    const label = r.kind === "lesson_charge" ? `занятие от ${formatDate(r.date)}` : (r.note ?? "начисление");
    const status = r.status === "paid" ? "оплачено" : r.status === "partial" ? "частично" : r.status === "debt" ? "не оплачено" : "";
    return `— ${label} — ${formatRub(r.amount)}${status ? ` (${status})` : ""}${r.cancelled ? " · отмена" : ""}`;
  });
  const parts = [`${studentName}, выписка за ${monthLabel}:`, ...lines];
  if (details?.trim()) parts.push("", `Реквизиты: ${details.trim()}`);
  return parts.join("\n");
}
