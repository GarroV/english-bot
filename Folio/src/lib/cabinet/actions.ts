"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMessage } from "@/lib/homework/queries";

export type MarkResult = { ok: true } | { ok: false; error: string };

const MAX_ANSWER_LEN = 5000;
const MAX_MESSAGE_LEN = 5000;

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

// Инлайн-ответы в пропусках текста (#56): вся карта ответов сохраняется целиком (дебаунс на клиенте).
// Безопасность зеркалит markSubmitted: token→student→своя сдача в редактируемом статусе, ничего с
// клиента не доверяем; ключи — номера пропусков или "free", размеры жёстко ограничены.
const INLINE_KEY_RE = /^(\d{1,3}|free)$/;
const MAX_INLINE_KEYS = 300;

export async function saveInlineAnswers(
  token: string,
  assignmentId: string,
  answers: Record<string, string>,
): Promise<MarkResult> {
  if (!token || !assignmentId) return { ok: false, error: "bad input" };
  if (typeof answers !== "object" || answers == null || Array.isArray(answers)) {
    return { ok: false, error: "bad input" };
  }
  const entries = Object.entries(answers);
  if (entries.length > MAX_INLINE_KEYS) return { ok: false, error: "too many answers" };
  const clean: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!INLINE_KEY_RE.test(k) || typeof v !== "string") return { ok: false, error: "bad input" };
    if (v.length > MAX_ANSWER_LEN) return { ok: false, error: "answer too long" };
    if (v !== "") clean[k] = v; // пустые не храним — карта не распухает
  }

  const admin = createAdminClient();
  const { data: student, error: sErr } = await admin
    .from("folio_students")
    .select("id")
    .eq("cabinet_token", token)
    .maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!student) return { ok: false, error: "invalid link" };

  const { data, error } = await admin
    .from("folio_homework_assignments")
    .update({ inline_answers: clean, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("student_id", student.id)
    .in("status", [...STUDENT_EDITABLE_STATUSES])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not editable" };
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

// Resolve the assignment id owned by the student behind this cabinet token. Service-role, scoped
// strictly by token→student→assignment: we never trust an assignmentId from the caller — it only counts
// if it belongs to this token's student. Returns null when the token is unknown or the assignment is
// not this student's (a forged/foreign id). Shared by the student chat read + write below.
async function resolveStudentAssignment(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: student, error: sErr } = await admin
    .from("folio_students")
    .select("id")
    .eq("cabinet_token", token)
    .maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!student) return { ok: false, error: "invalid link" };

  const { data: asg, error: aErr } = await admin
    .from("folio_homework_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (aErr) return { ok: false, error: aErr.message };
  if (!asg) return { ok: false, error: "not found" };
  return { ok: true };
}

export type MessagesResult = { ok: true; messages: ChatMessage[] } | { ok: false; error: string };

interface ChatMessageRow {
  id: string;
  author: "student" | "tutor";
  body: string;
  created_at: string;
}

// Read the chat thread for one of the student's assignments (live-doc Ф3 polling). Service-role,
// scoped token→student→assignment before any read — no direct client access to the messages table.
export async function listStudentMessages(token: string, assignmentId: string): Promise<MessagesResult> {
  if (!token || !assignmentId) return { ok: false, error: "bad input" };
  const admin = createAdminClient();

  const scope = await resolveStudentAssignment(admin, token, assignmentId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const { data, error } = await admin
    .from("folio_homework_messages")
    .select("id, author, body, created_at")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const messages = ((data as ChatMessageRow[]) ?? []).map((m) => ({
    id: m.id,
    author: m.author,
    body: m.body,
    createdAt: m.created_at,
  }));
  return { ok: true, messages };
}

// Post a student message onto an assignment's chat thread (live-doc Ф3). Service-role, scoped
// token→student→assignment exactly like saveAnswer/markSubmitted — we never trust an assignmentId that
// isn't this token's student's. `author` is hard-set to 'student' from context, never from the client.
// Chat is open in every status (including 'accepted'), so there is no status gate. .select() confirms
// the insert.
export async function postStudentMessage(token: string, assignmentId: string, body: string): Promise<MarkResult> {
  if (!token || !assignmentId) return { ok: false, error: "bad input" };
  if (typeof body !== "string") return { ok: false, error: "bad input" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty message" };
  if (trimmed.length > MAX_MESSAGE_LEN) return { ok: false, error: "message too long" };

  const admin = createAdminClient();
  const scope = await resolveStudentAssignment(admin, token, assignmentId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const { data, error } = await admin
    .from("folio_homework_messages")
    .insert({ assignment_id: assignmentId, author: "student", body: trimmed })
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "insert failed" };
  return { ok: true };
}
