import { createAdminClient } from "@/lib/supabase/admin";
import { splitAssignments, partitionLessons, type CabAssignment, type CabItem, type CabLesson } from "./derive";

export interface CabinetData {
  student: { id: string; name: string };
  tutorName: string | null;
  current: CabAssignment[];
  completed: CabAssignment[];
  upcoming: CabLesson[];
  recentPast: CabLesson[];
}

// PostgREST embeds a to-one relation as an object, but supabase-js types it as object|array — normalize.
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface TemplateJoin {
  topic: string;
  level: string | null;
  module_type: string;
  content: string;
}
interface AssignmentJoinRow {
  id: string;
  status: string;
  due_date: string | null;
  tutor_comment: string | null;
  submitted_at: string | null;
  inline_answers: Record<string, string> | null;
  folio_homework_templates: TemplateJoin | TemplateJoin[] | null;
}
interface LessonJoin {
  id: string;
  type: "solo" | "group";
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "completed" | "cancelled";
  location_type: "online" | "offline";
}
interface LessonStudentRow {
  folio_lessons: LessonJoin | LessonJoin[] | null;
}
interface ItemRow {
  id: string;
  assignment_id: string;
  idx: number;
  task_label: string | null;
  question_text: string;
  item_type: string;
  student_answer: string | null;
  tutor_comment: string | null;
}

// Resolve a cabinet token → the student's full cabinet, all scoped by the token (service-role).
// Returns null for an unknown/rotated token. Never accepts student_id from the caller.
export async function getCabinet(token: string, nowISO: string): Promise<CabinetData | null> {
  if (!token) return null;
  const admin = createAdminClient();

  const { data: student, error: sErr } = await admin
    .from("folio_students")
    .select("id, name, workspace_id")
    .eq("cabinet_token", token)
    .maybeSingle();
  if (sErr) throw new Error(`getCabinet student failed: ${sErr.message}`);
  if (!student) return null;

  const [aRes, lRes, wRes] = await Promise.all([
    admin
      .from("folio_homework_assignments")
      .select("id, status, due_date, tutor_comment, submitted_at, inline_answers, folio_homework_templates(topic, level, module_type, content)")
      .eq("student_id", student.id)
      .order("assigned_at", { ascending: false }),
    admin
      .from("folio_lesson_students")
      .select("folio_lessons(id, type, scheduled_at, duration_min, status, location_type)")
      .eq("student_id", student.id),
    admin.from("folio_workspaces").select("owner_id").eq("id", student.workspace_id).maybeSingle(),
  ]);
  if (aRes.error) throw new Error(`getCabinet assignments failed: ${aRes.error.message}`);
  if (lRes.error) throw new Error(`getCabinet lessons failed: ${lRes.error.message}`);

  const assignmentRows = (aRes.data as AssignmentJoinRow[]) ?? [];

  // Fetch itemized questions for exactly this student's assignments (service-role, scoped by token→student→assignment).
  const assignmentIds = assignmentRows.map((r) => r.id);
  const itemsByAssignment = new Map<string, CabItem[]>();
  if (assignmentIds.length > 0) {
    const { data: itemData, error: iErr } = await admin
      .from("folio_homework_items")
      .select("id, assignment_id, idx, task_label, question_text, item_type, student_answer, tutor_comment")
      .in("assignment_id", assignmentIds)
      .order("idx", { ascending: true });
    if (iErr) throw new Error(`getCabinet items failed: ${iErr.message}`);
    for (const it of (itemData as ItemRow[]) ?? []) {
      const list = itemsByAssignment.get(it.assignment_id) ?? [];
      list.push({
        id: it.id,
        idx: it.idx,
        taskLabel: it.task_label,
        questionText: it.question_text,
        itemType: it.item_type,
        studentAnswer: it.student_answer,
        tutorComment: it.tutor_comment,
      });
      itemsByAssignment.set(it.assignment_id, list);
    }
  }

  const assignments: CabAssignment[] = assignmentRows.map((r) => {
    const t = one(r.folio_homework_templates);
    return {
      id: r.id,
      topic: t?.topic ?? "—",
      level: t?.level ?? null,
      moduleType: t?.module_type ?? "",
      content: t?.content ?? "",
      status: r.status,
      dueDate: r.due_date,
      tutorComment: r.tutor_comment,
      submittedAt: r.submitted_at,
      inlineAnswers: r.inline_answers ?? null,
      items: itemsByAssignment.get(r.id) ?? [],
    };
  });

  const lessons: CabLesson[] = ((lRes.data as LessonStudentRow[]) ?? [])
    .map((r) => one(r.folio_lessons))
    .filter((l): l is LessonJoin => l !== null)
    .map((l) => ({
      id: l.id,
      scheduledAt: l.scheduled_at,
      durationMin: l.duration_min,
      type: l.type,
      locationType: l.location_type,
      status: l.status,
    }));

  let tutorName: string | null = null;
  const ownerId = (wRes.data?.owner_id as string | null | undefined) ?? null;
  if (ownerId) {
    const { data: owner } = await admin.from("folio_users").select("name").eq("id", ownerId).maybeSingle();
    tutorName = (owner?.name as string | null | undefined) ?? null;
  }

  const { current, completed } = splitAssignments(assignments);
  const { upcoming, recentPast } = partitionLessons(lessons, nowISO);
  return { student: { id: student.id, name: student.name }, tutorName, current, completed, upcoming, recentPast };
}
