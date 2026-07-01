"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type MarkResult = { ok: true } | { ok: false; error: string };

// Student marks a homework "done" (assigned → submitted). Scoped by the cabinet token: we resolve
// the student from the token and only touch that student's own assignment. Never trust a student_id
// from the caller. Idempotent-safe: only flips from 'assigned' (re-clicks / other statuses no-op).
export async function markSubmitted(token: string, assignmentId: string): Promise<MarkResult> {
  if (!token || !assignmentId) return { ok: false, error: "bad input" };
  const admin = createAdminClient();

  const { data: student, error: sErr } = await admin
    .from("folio_students")
    .select("id")
    .eq("cabinet_token", token)
    .maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!student) return { ok: false, error: "invalid link" };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("folio_homework_assignments")
    .update({ status: "submitted", submitted_at: now, updated_at: now })
    .eq("id", assignmentId)
    .eq("student_id", student.id)
    .eq("status", "assigned")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found or already submitted" };
  return { ok: true };
}
