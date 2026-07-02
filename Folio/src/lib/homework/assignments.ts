"use server";

import { createClient } from "@/lib/supabase/server";
import { assignInputSchema, assignmentStatusSchema, type AssignInput } from "./assignments-schema";
import { callItemize, type HomeworkItem } from "./generate";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignResult = { ok: true } | { ok: false; error: string };

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

// Mark an assignment reviewed and save the tutor's comment (visible to the student in their cabinet).
// RLS scopes to the caller's workspace.
export async function reviewAssignment(id: string, comment: string): Promise<AssignResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .update({ status: "reviewed", tutor_comment: comment.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

export async function updateAssignmentStatus(id: string, status: string): Promise<AssignResult> {
  const parsed = assignmentStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "bad status" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .update({ status: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
