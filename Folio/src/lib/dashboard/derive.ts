import type { LessonWithStudents } from "@/lib/lessons/queries";
import type { Balance } from "@/lib/billing/queries";
import type { AssignmentRow } from "@/lib/homework/queries";

// Дата YYYY-MM-DD в зоне Europe/Moscow (en-CA даёт ISO-формат даты).
export function mskDateString(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(iso));
}

// Занятия на сегодня (по Москве), без отменённых, по времени.
export function todayLessons(lessons: LessonWithStudents[], nowISO: string): LessonWithStudents[] {
  const today = mskDateString(nowISO);
  return lessons
    .filter((l) => l.status !== "cancelled" && mskDateString(l.scheduled_at) === today)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

// Должники: положительный баланс, по убыванию, с суммой.
export function debtors(balances: Balance[]): { rows: Balance[]; total: number } {
  const rows = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = rows.reduce((s, b) => s + b.balance, 0);
  return { rows, total };
}

// Бакеты домашек: submitted → на проверку; assigned с прошедшим due_date → просрочено.
export function homeworkBuckets(
  assignments: AssignmentRow[],
  todayISODate: string,
): { review: AssignmentRow[]; overdue: AssignmentRow[]; reviewCount: number; overdueCount: number } {
  const review = assignments.filter((a) => a.status === "submitted");
  const overdue = assignments.filter(
    (a) => a.status === "assigned" && a.due_date != null && a.due_date < todayISODate,
  );
  return { review, overdue, reviewCount: review.length, overdueCount: overdue.length };
}
