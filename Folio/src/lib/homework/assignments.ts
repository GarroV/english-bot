"use server";

import { createClient } from "@/lib/supabase/server";
import { assignInputSchema, type AssignInput } from "./assignments-schema";
import { callItemize, type HomeworkItem } from "./generate";
import { getAssignmentReview, getMessages, type AssignmentReview, type ChatMessage } from "./queries";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignResult = { ok: true } | { ok: false; error: string };

const MAX_COMMENT_LEN = 5000;
const MAX_MESSAGE_LEN = 5000;

// Assignment states in which the tutor may still add/edit per-item feedback. 'accepted' (and legacy
// 'reviewed') are terminal & read-only — commenting is refused there so finished feedback can't be
// silently rewritten after acceptance (matches the UI, which hides the comment box once accepted).
const TUTOR_COMMENTABLE_STATUSES = ["assigned", "submitted", "returned"] as const;

// Best-effort: itemize the template content and insert one row per question for each new assignment.
// Never throws — assignment already succeeded; itemization is additive (live-doc Ф1a).
async function populateItems(
  supabase: SupabaseClient,
  assignmentIds: string[],
  content: string,
): Promise<void> {
  if (assignmentIds.length === 0 || !content.trim()) return;
  try {
    const items: HomeworkItem[] = await callItemize(content); // one itemize pass, reused per student
    if (items.length === 0) return;
    const rows = assignmentIds.flatMap((assignmentId) =>
      items.map((item, idx) => ({
        assignment_id: assignmentId,
        idx,
        task_label: item.task_label || null,
        question_text: item.question_text,
        item_type: item.item_type,
      })),
    );
    const { error } = await supabase.from("folio_homework_items").insert(rows);
    if (error) console.error("populateItems insert failed:", error.message);
  } catch (e) {
    console.error("populateItems failed:", e instanceof Error ? e.message : e);
  }
}

export async function assignTemplate(input: AssignInput): Promise<AssignResult> {
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };

  const v = parsed.data;
  const rows = v.studentIds.map((sid) => ({
    workspace_id: workspaceId,
    template_id: v.templateId,
    student_id: sid,
    assigned_by: user.id,
    due_date: v.dueDate ?? null,
  }));
  // Re-assigning the same template to the same student is a no-op (unique constraint).
  // `.select("id")` returns only the freshly inserted rows (skipped duplicates are omitted),
  // so we itemize only for genuinely new assignments.
  const { data: inserted, error } = await supabase
    .from("folio_homework_assignments")
    .upsert(rows, { onConflict: "template_id,student_id", ignoreDuplicates: true })
    .select("id");
  if (error) return { ok: false, error: error.message };

  // Populate itemized questions for the new assignments (best-effort, additive — never fails the assign).
  const newIds = (inserted ?? []).map((r) => r.id as string);
  if (newIds.length > 0) {
    const { data: template } = await supabase
      .from("folio_homework_templates")
      .select("content")
      .eq("id", v.templateId)
      .maybeSingle();
    const content = (template?.content as string | undefined) ?? "";
    await populateItems(supabase, newIds, content);
  }
  return { ok: true };
}

// Save the tutor's per-item comment on one itemized question (live-doc Ф2). Only the tutor_comment
// column is touched, so a concurrent student answer-save never collides. Security: session + workspace
// RLS — the update is constrained to items whose parent assignment is BOTH in the caller's workspace
// (RLS-through-parent) AND in a non-terminal state, so a forged itemId from another workspace and a
// comment on an already-accepted assignment both match no row. We never trust the client to have scoped
// the id; RLS + the status allowlist do the gating and .select() confirms a row changed (empty = failure).
export async function commentOnItem(itemId: string, comment: string): Promise<AssignResult> {
  if (!itemId || typeof itemId !== "string") return { ok: false, error: "bad input" };
  if (typeof comment !== "string") return { ok: false, error: "bad input" };
  if (comment.length > MAX_COMMENT_LEN) return { ok: false, error: "comment too long" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  // Non-terminal assignments in the caller's workspace (RLS scopes to workspace). Constraining the item
  // update to this set enforces the read-only-after-accept invariant server-side, not just in the UI.
  const { data: commentable, error: cErr } = await supabase
    .from("folio_homework_assignments")
    .select("id")
    .in("status", [...TUTOR_COMMENTABLE_STATUSES]);
  if (cErr) return { ok: false, error: cErr.message };
  const commentableIds = (commentable ?? []).map((r) => r.id as string);
  if (commentableIds.length === 0) return { ok: false, error: "not found" };

  const { data, error } = await supabase
    .from("folio_homework_items")
    .update({ tutor_comment: comment.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .in("assignment_id", commentableIds)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

// Move an assignment through the review cycle, gated by the allowed source states. Session + workspace
// RLS scopes the update to the caller's workspace; the `.in("status", from)` guard enforces the state
// machine (e.g. only 'submitted' may be returned) so out-of-order transitions no-op. .select() confirms
// the transition landed on a real row; an empty result is an explicit failure.
async function transition(id: string, from: readonly string[], to: string): Promise<AssignResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "bad input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", [...from])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found or wrong state" };
  return { ok: true };
}

// Return a submitted assignment to the student for another pass (submitted → returned).
export async function returnAssignment(id: string): Promise<AssignResult> {
  return transition(id, ["submitted"], "returned");
}

// Accept an assignment — final approval, terminal & read-only (submitted|returned → accepted).
export async function acceptAssignment(id: string): Promise<AssignResult> {
  return transition(id, ["submitted", "returned"], "accepted");
}

// Post a tutor message onto an assignment's chat thread (live-doc Ф3). Security: session + workspace
// RLS — the insert relies on the RLS `with_check` through the parent assignment, so a forged
// assignmentId from another workspace is rejected. `author` is hard-set to 'tutor' from context, never
// taken from the client. `.select("id")` confirms a row landed; an empty result (RLS refused a foreign
// assignmentId) is an explicit failure, never a silent ok. Chat stays open in every status, including
// after 'accepted' (discussion continues) — no status gate here by design.
export async function postTutorMessage(assignmentId: string, body: string): Promise<AssignResult> {
  if (!assignmentId || typeof assignmentId !== "string") return { ok: false, error: "bad input" };
  if (typeof body !== "string") return { ok: false, error: "bad input" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty message" };
  if (trimmed.length > MAX_MESSAGE_LEN) return { ok: false, error: "message too long" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data, error } = await supabase
    .from("folio_homework_messages")
    .insert({ assignment_id: assignmentId, author: "tutor", body: trimmed })
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

// Server-action wrapper so the client review dialog can load the itemized review payload on demand.
// Auth + workspace RLS are enforced inside getAssignmentReview (session client), so a forged id from
// another workspace resolves to null.
export type ReviewResult = { ok: true; review: AssignmentReview } | { ok: false; error: string };
export async function loadReview(id: string): Promise<ReviewResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "bad input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  try {
    const review = await getAssignmentReview(id);
    if (!review) return { ok: false, error: "not found" };
    return { ok: true, review };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

// Server-action wrapper so the client chat never imports queries.ts directly (it pulls in
// next/headers, which is server-only and breaks the client bundle). getMessages runs the session
// client — workspace RLS scopes the thread; an unauthenticated session or bad id yields nothing.
export async function loadMessages(assignmentId: string): Promise<ChatMessage[]> {
  if (!assignmentId || typeof assignmentId !== "string") return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  return getMessages(assignmentId);
}
