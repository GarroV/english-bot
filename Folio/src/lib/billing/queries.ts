import { createClient } from "@/lib/supabase/server";

export interface Balance {
  student_id: string;
  name: string;
  charged: number;
  paid: number;
  balance: number;
}

export interface LedgerEntry {
  id: string;
  student_id: string;
  type: string;
  amount: number;
  lesson_id: string | null;
  note: string | null;
  created_at: string;
}

// Per active student: total charged, total paid, and the outstanding balance (charged - paid).
export async function listBalances(): Promise<Balance[]> {
  const supabase = await createClient();
  const [studentsRes, entriesRes] = await Promise.all([
    supabase.from("folio_students").select("id, name").is("archived_at", null).order("name", { ascending: true }),
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
  return ((studentsRes.data as { id: string; name: string }[]) ?? []).map((s) => {
    const a = agg.get(s.id) ?? { charged: 0, paid: 0 };
    return { student_id: s.id, name: s.name, charged: a.charged, paid: a.paid, balance: a.charged - a.paid };
  });
}

// All ledger entries (RLS-scoped), newest first — grouped per student in the UI.
export async function listLedgerEntries(): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_student_payments")
    .select("id, student_id, type, amount, lesson_id, note, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listLedgerEntries failed: ${error.message}`);
  return ((data as (LedgerEntry & { amount: number | string })[]) ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
}
