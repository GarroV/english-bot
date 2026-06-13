"use server";

import { createClient } from "@/lib/supabase/server";
import { lessonInputSchema, lessonTypeFor, type LessonInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function createLesson(input: LessonInput): Promise<ActionResult> {
  const parsed = lessonInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const workspaceId = await callerWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { data: lesson, error: insErr } = await supabase
    .from("folio_lessons")
    .insert({
      workspace_id: workspaceId,
      type: lessonTypeFor(v.studentIds),
      scheduled_at: v.scheduledAt,
      duration_min: v.durationMin,
      location_type: v.locationType,
      notes: v.notes ?? null,
    })
    .select("id")
    .single();
  if (insErr || !lesson) return { ok: false, error: insErr?.message ?? "create failed" };

  const rows = v.studentIds.map((sid) => ({ lesson_id: lesson.id, student_id: sid }));
  const { error: rosterErr } = await supabase.from("folio_lesson_students").insert(rows);
  if (rosterErr) {
    const { error: cleanupErr } = await supabase.from("folio_lessons").delete().eq("id", lesson.id);
    if (cleanupErr) {
      // Two sequential failures: the lesson row is now orphaned (no students). Surface it.
      console.error(`createLesson: roster insert failed AND cleanup failed for lesson ${lesson.id}: ${cleanupErr.message}`);
    }
    return { ok: false, error: rosterErr.message };
  }
  return { ok: true };
}

export async function updateLesson(
  id: string,
  fields: { scheduledAt: string; durationMin: number; locationType: "online" | "offline"; notes?: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data, error } = await supabase
    .from("folio_lessons")
    .update({
      scheduled_at: fields.scheduledAt,
      duration_min: fields.durationMin,
      location_type: fields.locationType,
      notes: fields.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

async function setStatus(id: string, status: "completed" | "cancelled"): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_lessons")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

export async function completeLesson(id: string): Promise<ActionResult> {
  return setStatus(id, "completed");
}

export async function cancelLesson(id: string): Promise<ActionResult> {
  return setStatus(id, "cancelled");
}
