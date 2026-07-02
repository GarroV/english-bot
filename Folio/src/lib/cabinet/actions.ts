"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type MarkResult = { ok: true } | { ok: false; error: string };

const MAX_ANSWER_LEN = 5000;

// States in which the student may edit answers and (re)submit (live-doc Ф2 review cycle):
// 'assigned' (first pass) and 'returned' (tutor sent it back for another pass). 'submitted' waits for
// review and 'accepted' is the read-only terminal — both frozen.
const STUDENT_EDITABLE_STATUSES = ["assigned", "returned"] as const;

// Student submits homework for review (assigned|returned → submitted, i.e. first submit or resubmit).
// Scoped by the cabinet token: we resolve the student from the token and only touch that student's own
// assignment. Never trust a student_id from the caller. Idempotent-safe: only flips from an editable
// state, so re-clicks / already-submitted / accepted no-op via the status guard + .select() check.
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
    .in("status", [...STUDENT_EDITABLE_STATUSES])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found or already submitted" };
  return { ok: true };
}

// Student saves an answer to one itemized question (live-doc Ф1b, review cycle in Ф2). Security mirrors
// markSubmitted: service-role, scoped strictly by token→student→assignment→item. Never trusts a
// student_id/assignment from the caller. Editing is allowed while the assignment is 'assigned' or
// 'returned' (tutor sent it back) — once 'submitted' (in review) or 'accepted' (terminal) the answer is
// frozen, so the update is constrained to items whose parent assignment is in an editable state AND
// belongs to this student. We confirm a row actually changed via .select(); an empty result is an
// explicit failure, never a silent ok.
export async function saveAnswer(token: string, itemId: string, answer: string): Promise<MarkResult> {
  if (!token || !itemId) return { ok: false, error: "bad input" };
  if (typeof answer !== "string") return { ok: false, error: "bad input" };
  if (answer.length > MAX_ANSWER_LEN) return { ok: false, error: "answer too long" };

  const admin = createAdminClient();

  const { data: student, error: sErr } = await admin
    .from("folio_students")
    .select("id")
    .eq("cabinet_token", token)
    .maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!student) return { ok: false, error: "invalid link" };

  // Editable assignments = this student's assignments in an editable state ('assigned' | 'returned').
  // Constraining the item update to this set enforces both ownership and the status gate in one query.
  const { data: editable, error: aErr } = await admin
    .from("folio_homework_assignments")
    .select("id")
    .eq("student_id", student.id)
    .in("status", [...STUDENT_EDITABLE_STATUSES]);
  if (aErr) return { ok: false, error: aErr.message };
  const editableIds = (editable ?? []).map((r) => r.id as string);
  if (editableIds.length === 0) return { ok: false, error: "not editable" };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("folio_homework_items")
    .update({ student_answer: answer, updated_at: now })
    .eq("id", itemId)
    .in("assignment_id", editableIds)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found or not editable" };
  return { ok: true };
}
