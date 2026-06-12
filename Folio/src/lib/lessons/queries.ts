import { createClient } from "@/lib/supabase/server";

export interface StudentOption {
  id: string;
  name: string;
}

export interface LessonWithStudents {
  id: string;
  type: "solo" | "group";
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "completed" | "cancelled";
  location_type: "online" | "offline";
  notes: string | null;
  students: StudentOption[];
}

interface LessonRow {
  id: string;
  type: "solo" | "group";
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "completed" | "cancelled";
  location_type: "online" | "offline";
  notes: string | null;
  folio_lesson_students: { folio_students: StudentOption | null }[] | null;
}

// Lessons whose scheduled_at is within [fromISO, toISO), with each lesson's students.
export async function listLessonsInRange(fromISO: string, toISO: string): Promise<LessonWithStudents[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_lessons")
    .select(
      "id, type, scheduled_at, duration_min, status, location_type, notes, folio_lesson_students(folio_students(id, name))",
    )
    .gte("scheduled_at", fromISO)
    .lt("scheduled_at", toISO)
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(`listLessonsInRange failed: ${error.message}`);

  return ((data as LessonRow[]) ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    scheduled_at: row.scheduled_at,
    duration_min: row.duration_min,
    status: row.status,
    location_type: row.location_type,
    notes: row.notes,
    students: (row.folio_lesson_students ?? [])
      .map((ls) => ls.folio_students)
      .filter((s): s is StudentOption => s !== null),
  }));
}

// Active (non-archived) students for the lesson picker.
export async function listActiveStudents(): Promise<StudentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_students")
    .select("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(`listActiveStudents failed: ${error.message}`);
  return (data as StudentOption[]) ?? [];
}
