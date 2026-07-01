"use server";

import { createClient } from "@/lib/supabase/server";
import { lessonInputSchema, lessonTypeFor, type LessonInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createLesson(input: LessonInput): Promise<ActionResult> {
  const parsed = lessonInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  // Atomic RPC: lesson row + roster in one transaction (RLS-enforced workspace + student checks).
  const { error } = await supabase.rpc("folio_create_lesson", {
    p_type: lessonTypeFor(v.studentIds),
    p_scheduled_at: v.scheduledAt,
    p_duration_min: v.durationMin,
    p_location_type: v.locationType,
    p_notes: v.notes ?? null,
    p_student_ids: v.studentIds,
  });
  if (error) return { ok: false, error: error.message };
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

// Mark completed and (re)create per-student charges from current rates — status + ledger atomically.
export async function completeLesson(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { error } = await supabase.rpc("folio_complete_lesson", { p_lesson_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Revert a completed lesson back to scheduled and remove its charges — atomically.
export async function reopenLesson(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { error } = await supabase.rpc("folio_reopen_lesson", { p_lesson_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Cancel a lesson and remove its charges (a cancelled lesson is not billed) — atomically.
export async function cancelLesson(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { error } = await supabase.rpc("folio_cancel_lesson", { p_lesson_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
