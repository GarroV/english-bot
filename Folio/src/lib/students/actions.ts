"use server";

import { createClient } from "@/lib/supabase/server";
import { studentInputSchema, type StudentInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Resolve the authenticated caller's workspace from their folio_users profile.
// workspace_id is NEVER taken from the client.
async function callerWorkspaceId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("folio_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

export async function createStudent(input: StudentInput): Promise<ActionResult> {
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const workspaceId = await callerWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { error } = await supabase.from("folio_students").insert({
    workspace_id: workspaceId,
    name: v.name,
    email: v.email ?? null,
    telegram_id: v.telegramId ?? null,
    default_rate: v.defaultRate ?? null,
    notes: v.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateStudent(id: string, input: StudentInput): Promise<ActionResult> {
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("folio_students")
    .update({
      name: v.name,
      email: v.email ?? null,
      telegram_id: v.telegramId ?? null,
      default_rate: v.defaultRate ?? null,
      notes: v.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

// Soft archive: hide from the active list, data kept, reversible.
export async function archiveStudent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("folio_students")
    .update({ archived_at: now, updated_at: now })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

export async function restoreStudent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_students")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
