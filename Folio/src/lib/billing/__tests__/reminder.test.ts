import { describe, it, expect } from "vitest";
import { buildReminderMessage, buildMonthStatement } from "../reminder";
import type { HistoryRow } from "../fifo";

const row = (over: Partial<HistoryRow>): HistoryRow => ({
  kind: "lesson_charge", id: "x", date: "2026-06-12T10:00:00Z", amount: 700,
  note: null, status: "debt", covered: 0, cancelled: false, ...over,
});

// Нормализует пробелы для устойчивого сравнения: Intl.NumberFormat("ru-RU")
// выдаёт неразрывный узкий пробел (U+202F), который визуально как обычный пробел,
// но в тесте нельзя писать прямо. Заменяем любые пробельные символы на обычный.
const normalizeWhitespace = (s: string) => s.replace(/[\s ]/g, " ");

describe("buildReminderMessage", () => {
  it("перечисляет неоплаченные занятия с датами, частичное — с остатком, и итог", () => {
    const msg = buildReminderMessage("Настя", [
      row({ status: "debt", date: "2026-06-19T10:00:00Z" }),
      row({ status: "partial", covered: 400, date: "2026-06-12T10:00:00Z" }),
      row({ status: "paid", date: "2026-06-05T10:00:00Z" }),
      row({ kind: "payment", status: null, amount: 400 }),
    ], "Сбер 1234");
    const normalized = normalizeWhitespace(msg);
    expect(normalized).toContain("Настя");
    expect(normalized).toContain("занятие от 19.06.26 — 700 ₽");
    expect(normalized).toContain("занятие от 12.06.26 — осталось 300 ₽");
    expect(normalized).not.toContain("05.06.26");
    expect(normalized).toContain("Итого: 1 000 ₽");
    expect(normalized).toContain("Сбер 1234");
  });
  it("без реквизитов — без блока реквизитов", () => {
    const msg = buildReminderMessage("Настя", [row({})], null);
    expect(msg).not.toContain("Реквизиты");
  });
  it("включает неоплаченное ручное начисление в список и в Итого", () => {
    const msg = buildReminderMessage("Настя", [
      row({ status: "debt", date: "2026-06-19T10:00:00Z" }),
      row({ kind: "manual_charge", status: "debt", amount: 300, note: "доплата за учебник", date: "2026-06-20T10:00:00Z" }),
    ], null);
    const normalized = normalizeWhitespace(msg);
    expect(normalized).toContain("— доплата за учебник: 300 ₽");
    expect(normalized).toContain("Итого: 1 000 ₽");
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
