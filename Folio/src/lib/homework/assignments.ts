"use server";

import { createClient } from "@/lib/supabase/server";
import { assignInputSchema, assignmentStatusSchema, type AssignInput } from "./assignments-schema";

export type AssignResult = { ok: true } | { ok: false; error: string };

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
  const { error } = await supabase
    .from("folio_homework_assignments")
    .upsert(rows, { onConflict: "template_id,student_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
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
