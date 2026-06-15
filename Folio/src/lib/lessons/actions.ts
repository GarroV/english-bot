"use server";

import { createClient } from "@/lib/supabase/server";
import { lessonInputSchema, lessonTypeFor, type LessonInput } from "./schema";
import { chargeForCompletedLesson, reverseChargesForLesson } from "@/lib/billing/charges";

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

async function setStatus(id: string, status: "scheduled" | "completed" | "cancelled"): Promise<ActionResult> {
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

// Mark completed and create per-student charges (best-effort: status is the source of truth).
export async function completeLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "completed");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await chargeForCompletedLesson(supabase, id, user.id);
  } catch (e) {
    console.error(`completeLesson: charging failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

// Revert a completed lesson back to scheduled (un-check the "состоялось" box); remove its charges.
export async function reopenLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "scheduled");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    await reverseChargesForLesson(supabase, id);
  } catch (e) {
    console.error(`reopenLesson: reversing charges failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

// Cancel; a cancelled lesson is not billed, so remove any charges too.
export async function cancelLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "cancelled");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    await reverseChargesForLesson(supabase, id);
  } catch (e) {
    console.error(`cancelLesson: reversing charges failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}
