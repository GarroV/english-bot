import { describe, it, expect } from "vitest";
import { todayLessons, debtors, homeworkBuckets, mskDateString } from "./derive";

const lesson = (id: string, scheduled_at: string, status = "scheduled") => ({
  id,
  type: "solo" as const,
  scheduled_at,
  duration_min: 60,
  status: status as "scheduled" | "completed" | "cancelled",
  location_type: "online" as const,
  notes: null,
  students: [{ id: "s1", name: "Аня" }],
});

describe("mskDateString", () => {
  it("конвертирует UTC в дату по Москве (+3)", () => {
    expect(mskDateString("2026-06-30T21:30:00Z")).toBe("2026-07-01"); // 00:30 МСК
  });
});

describe("todayLessons", () => {
  it("оставляет только занятия сегодня по МСК, без отменённых, по времени", () => {
    const now = "2026-06-30T08:00:00Z";
    const out = todayLessons(
      [
        lesson("a", "2026-06-30T15:00:00Z"),
        lesson("b", "2026-06-30T07:00:00Z"),
        lesson("c", "2026-07-01T07:00:00Z"), // завтра
        lesson("d", "2026-06-30T10:00:00Z", "cancelled"),
      ],
      now,
    );
    expect(out.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("debtors", () => {
  it("только положительный баланс, по убыванию, с суммой", () => {
    const r = debtors([
      { student_id: "1", name: "A", charged: 100, paid: 100, balance: 0 },
      { student_id: "2", name: "B", charged: 300, paid: 100, balance: 200 },
      { student_id: "3", name: "C", charged: 150, paid: 100, balance: 50 },
    ]);
    expect(r.rows.map((x) => x.student_id)).toEqual(["2", "3"]);
    expect(r.total).toBe(250);
  });
});

describe("homeworkBuckets", () => {
  it("submitted → review; assigned с прошедшим due_date → overdue", () => {
    const row = (id: string, status: string, due_date: string | null) => ({
      id,
      status,
      due_date,
      student_name: "A",
      template_topic: "T",
      template_type: "READING_MODULE",
    });
    const r = homeworkBuckets(
      [
        row("a", "submitted", null),
        row("b", "assigned", "2026-06-28"),
        row("c", "assigned", "2026-07-05"),
        row("d", "reviewed", "2026-06-01"),
      ],
      "2026-06-30",
    );
    expect(r.review.map((x) => x.id)).toEqual(["a"]);
    expect(r.overdue.map((x) => x.id)).toEqual(["b"]);
    expect(r.reviewCount).toBe(1);
    expect(r.overdueCount).toBe(1);
  });
});
