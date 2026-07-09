"use server";

import { createClient } from "@/lib/supabase/server";
import { homeworkInputSchema, type HomeworkInput } from "./schema";
import { callGenerate, callEdit, QuotaExceededError } from "./generate";

export type GenResult = { ok: true; content: string } | { ok: false; error: string };
export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

// Generate (preview only, not persisted). Auth-gated so anon can't burn tokens.
export async function generateHomework(input: HomeworkInput): Promise<GenResult> {
  const parsed = homeworkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  // Воркспейс из собственной строки folio_users (RLS-allowed) — folio-generate по нему
  // проверяет квоту и пишет учёт расхода (#75/#23).
  const { data: profile } = await supabase.from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = (profile?.workspace_id as string | null) ?? undefined;
  try {
    const content = await callGenerate(parsed.data, workspaceId);
    return { ok: true, content };
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return { ok: false, error: `лимит генераций исчерпан (${e.used} из ${e.granted}) — попросите администратора добавить генерации` };
    }
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

// Обновить контент сохранённого шаблона (#60). Session-клиент: RLS воркспейса скоупит
// update — чужой id просто не совпадёт (0 строк → not found), отдельной проверки не нужно.
export async function updateTemplate(id: string, content: string): Promise<SaveResult> {
  if (!content.trim()) return { ok: false, error: "empty content" };
  if (content.length > 100_000) return { ok: false, error: "content too large" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_homework_templates").update({ content }).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true, id: data[0].id as string };
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
  const { data, error } = await supabase.from("folio_homework_templates").insert({
    workspace_id: workspaceId,
    module_type: v.moduleType,
    level: v.level,
    age_group: v.ageGroup,
    topic: v.topic,
    content,
    source: "web",
    created_by: user.id,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}
