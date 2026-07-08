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
