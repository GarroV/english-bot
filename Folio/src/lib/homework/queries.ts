import { createClient } from "@/lib/supabase/server";

export interface TemplateRow {
  id: string;
  module_type: string;
  level: string | null;
  age_group: string | null;
  topic: string;
  content: string;
  created_at: string;
}

// Saved templates for the caller's workspace (RLS-scoped), newest first.
export async function listTemplates(): Promise<TemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_templates")
    .select("id, module_type, level, age_group, topic, content, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTemplates failed: ${error.message}`);
  return (data as TemplateRow[]) ?? [];
}

export interface AssignmentRow {
  id: string;
  status: string;
  due_date: string | null;
  tutor_comment: string | null;
  student_name: string | null;
  template_topic: string | null;
  template_type: string | null;
}

interface AssignmentJoinRow {
  id: string;
  status: string;
  due_date: string | null;
  tutor_comment: string | null;
  folio_students: { name: string } | { name: string }[] | null;
  folio_homework_templates: { topic: string; module_type: string } | { topic: string; module_type: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// One itemized question with the student's answer + the tutor's per-item comment (live-doc Ф2 review).
export interface ReviewItem {
  id: string;
  idx: number;
  taskLabel: string | null;
  questionText: string;
  studentAnswer: string | null;
  tutorComment: string | null;
}

export interface AssignmentReview {
  id: string;
  status: string;
  studentName: string | null;
  templateTopic: string | null;
  items: ReviewItem[];
}

interface ReviewItemRow {
  id: string;
  idx: number;
  task_label: string | null;
  question_text: string;
  student_answer: string | null;
  tutor_comment: string | null;
}

// The itemized review payload for one assignment (RLS-scoped to the caller's workspace, both the
// assignment and its items). Returns null when the id is not in the caller's workspace.
export async function getAssignmentReview(id: string): Promise<AssignmentReview | null> {
  const supabase = await createClient();
  const { data: asg, error: aErr } = await supabase
    .from("folio_homework_assignments")
    .select("id, status, folio_students(name), folio_homework_templates(topic)")
    .eq("id", id)
    .maybeSingle();
  if (aErr) throw new Error(`getAssignmentReview failed: ${aErr.message}`);
  if (!asg) return null;

  const { data: itemData, error: iErr } = await supabase
    .from("folio_homework_items")
    .select("id, idx, task_label, question_text, student_answer, tutor_comment")
    .eq("assignment_id", id)
    .order("idx", { ascending: true });
  if (iErr) throw new Error(`getAssignmentReview items failed: ${iErr.message}`);

  const row = asg as unknown as {
    id: string;
    status: string;
    folio_students: { name: string } | { name: string }[] | null;
    folio_homework_templates: { topic: string } | { topic: string }[] | null;
  };
  const student = one(row.folio_students);
  const tpl = one(row.folio_homework_templates);
  return {
    id: row.id,
    status: row.status,
    studentName: student?.name ?? null,
    templateTopic: tpl?.topic ?? null,
    items: ((itemData as ReviewItemRow[]) ?? []).map((it) => ({
      id: it.id,
      idx: it.idx,
      taskLabel: it.task_label,
      questionText: it.question_text,
      studentAnswer: it.student_answer,
      tutorComment: it.tutor_comment,
    })),
  };
}

// One chat message on an assignment thread (live-doc Ф3). `author` is set server-side from context.
export interface ChatMessage {
  id: string;
  author: "student" | "tutor";
  body: string;
  createdAt: string;
}

interface ChatMessageRow {
  id: string;
  author: "student" | "tutor";
  body: string;
  created_at: string;
}

// The chat thread for one assignment (RLS-scoped to the caller's workspace through the parent
// assignment), oldest first. A forged id from another workspace matches no row → empty thread.
export async function getMessages(assignmentId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_messages")
    .select("id, author, body, created_at")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getMessages failed: ${error.message}`);
  return ((data as ChatMessageRow[]) ?? []).map((m) => ({
    id: m.id,
    author: m.author,
    body: m.body,
    createdAt: m.created_at,
  }));
}

// Workspace assignments (RLS-scoped) with student name + template topic/type, newest first.
export async function listAssignments(): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .select("id, status, due_date, tutor_comment, folio_students(name), folio_homework_templates(topic, module_type)")
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(`listAssignments failed: ${error.message}`);
  return ((data as AssignmentJoinRow[]) ?? []).map((r) => {
    const student = one(r.folio_students);
    const tpl = one(r.folio_homework_templates);
    return {
      id: r.id,
      status: r.status,
      due_date: r.due_date,
      tutor_comment: r.tutor_comment,
      student_name: student?.name ?? null,
      template_topic: tpl?.topic ?? null,
      template_type: tpl?.module_type ?? null,
    };
  });
}
