"use server";

import { createClient } from "@/lib/supabase/server";
import { homeworkInputSchema, type HomeworkInput } from "./schema";
import { callGenerate, callEdit } from "./generate";

export type GenResult = { ok: true; content: string } | { ok: false; error: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

// Generate (preview only, not persisted). Auth-gated so anon can't burn tokens.
export async function generateHomework(input: HomeworkInput): Promise<GenResult> {
  const parsed = homeworkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  try {
    const content = await callGenerate(parsed.data);
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generation failed" };
  }
}

// Proofread/revise a previewed result (auth-gated). Returns the revised content.
export async function editHomework(content: string, edit: string): Promise<GenResult> {
  if (!content.trim()) return { ok: false, error: "empty content" };
  if (!edit.trim()) return { ok: false, error: "empty edit" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  try {
    const revised = await callEdit(content, edit);
    return { ok: true, content: revised };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "edit failed" };
  }
}

// Persist a previewed result as a template (workspace + author from session).
export async function saveTemplate(input: HomeworkInput, content: string): Promise<SaveResult> {
  const parsed = homeworkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  if (!content.trim()) return { ok: false, error: "empty content" };
  if (content.length > 100_000) return { ok: false, error: "content too large" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_homework_templates").insert({
    workspace_id: workspaceId,
    module_type: v.moduleType,
    level: v.level,
    age_group: v.ageGroup,
    topic: v.topic,
    content,
    source: "web",
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
