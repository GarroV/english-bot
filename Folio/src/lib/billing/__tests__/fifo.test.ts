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
