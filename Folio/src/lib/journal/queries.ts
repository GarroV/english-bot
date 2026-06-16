import { createClient } from "@/lib/supabase/server";

export interface JournalEntry {
  id: string;
  lesson_id: string;
  topic: string | null;
  level: string | null;
  comment: string | null;
  progress: string | null;
  created_at: string;
  updated_at: string;
}

const ENTRY_COLS = "id, lesson_id, topic, level, comment, progress, created_at, updated_at";

// The single journal entry for a lesson, or null (RLS-scoped to the workspace).
export async function getJournalForLesson(lessonId: string): Promise<JournalEntry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_lesson_journal")
    .select(ENTRY_COLS)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw new Error(`getJournalForLesson failed: ${error.message}`);
  return (data as JournalEntry | null) ?? null;
}

export interface JournalEntryWithLesson extends JournalEntry {
  scheduled_at: string;
  lesson_type: "solo" | "group";
}

interface JoinedRow extends JournalEntry {
  // to-one embed; supabase-js infers an array, PostgREST returns an object — accept both.
  folio_lessons: { scheduled_at: string; type: "solo" | "group" }
    | { scheduled_at: string; type: "solo" | "group" }[]
    | null;
}

// Journal entries for lessons the given student attended (via the roster), newest lesson first.
export async function listJournalForStudent(studentId: string): Promise<JournalEntryWithLesson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_lesson_journal")
    .select(
      `${ENTRY_COLS}, folio_lessons!inner(scheduled_at, type, folio_lesson_students!inner(student_id))`,
    )
    .eq("folio_lessons.folio_lesson_students.student_id", studentId)
    .order("scheduled_at", { referencedTable: "folio_lessons", ascending: false });
  if (error) throw new Error(`listJournalForStudent failed: ${error.message}`);

  return ((data as JoinedRow[]) ?? []).map((row) => {
    const lesson = Array.isArray(row.folio_lessons) ? row.folio_lessons[0] : row.folio_lessons;
    return {
      id: row.id,
      lesson_id: row.lesson_id,
      topic: row.topic,
      level: row.level,
      comment: row.comment,
      progress: row.progress,
      created_at: row.created_at,
      updated_at: row.updated_at,
      scheduled_at: lesson?.scheduled_at ?? row.created_at,
      lesson_type: lesson?.type ?? "solo",
    };
  });
}
