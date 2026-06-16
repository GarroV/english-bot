"use server";

import { createClient } from "@/lib/supabase/server";
import { journalInputSchema, type JournalInput } from "./schema";
import {
  getJournalForLesson, listJournalForStudent,
  type JournalEntry, type JournalEntryWithLesson,
} from "./queries";

export type JournalResult = { ok: true } | { ok: false; error: string };

// Upsert the journal entry for a lesson (one per lesson). workspace_id + created_by
// come from the session, never the client; the request-scoped client applies RLS.
export async function saveJournalEntry(lessonId: string, input: JournalInput): Promise<JournalResult> {
  const parsed = journalInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };

  const v = parsed.data;
  const { error } = await supabase
    .from("folio_lesson_journal")
    .upsert(
      {
        workspace_id: workspaceId,
        lesson_id: lessonId,
        topic: v.topic || null,
        level: v.level || null,
        comment: v.comment || null,
        progress: v.progress || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Load the journal entry for a lesson (client dialogs call this on open).
export async function loadJournalEntry(
  lessonId: string,
): Promise<{ ok: true; entry: JournalEntry | null } | { ok: false; error: string }> {
  try {
    return { ok: true, entry: await getJournalForLesson(lessonId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "load failed" };
  }
}

// Load a student's journal history (client history dialog calls this on open).
export async function loadJournalForStudent(
  studentId: string,
): Promise<{ ok: true; entries: JournalEntryWithLesson[] } | { ok: false; error: string }> {
  try {
    return { ok: true, entries: await listJournalForStudent(studentId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "load failed" };
  }
}
