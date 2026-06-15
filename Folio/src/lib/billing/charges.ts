import { createClient } from "@/lib/supabase/server";
import { chargeAmount } from "./amount";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface RosterRow {
  student_id: string;
  rate_override: number | null;
  folio_students: { default_rate: number | null } | { default_rate: number | null }[] | null;
}

// Create one 'charge' per student of a completed lesson. Idempotent (unique lesson_id+student_id).
// workspace_id comes from the lesson row (RLS-authoritative). Best-effort: callers log failures.
export async function chargeForCompletedLesson(supabase: SupabaseClient, lessonId: string, userId: string): Promise<void> {
  const { data: lesson } = await supabase
    .from("folio_lessons").select("workspace_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return;
  const { data: roster } = await supabase
    .from("folio_lesson_students")
    .select("student_id, rate_override, folio_students(default_rate)")
    .eq("lesson_id", lessonId);

  const rows = ((roster as RosterRow[]) ?? []).map((r) => {
    const fs = Array.isArray(r.folio_students) ? r.folio_students[0] : r.folio_students;
    return {
      workspace_id: (lesson as { workspace_id: string }).workspace_id,
      student_id: r.student_id,
      type: "charge" as const,
      amount: chargeAmount(r.rate_override ?? null, fs?.default_rate ?? null),
      lesson_id: lessonId,
      created_by: userId,
    };
  });
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("folio_student_payments")
    .upsert(rows, { onConflict: "lesson_id,student_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// Remove the charges tied to a lesson (on reopen/cancel).
export async function reverseChargesForLesson(supabase: SupabaseClient, lessonId: string): Promise<void> {
  const { error } = await supabase
    .from("folio_student_payments").delete().eq("lesson_id", lessonId).eq("type", "charge");
  if (error) throw new Error(error.message);
}
