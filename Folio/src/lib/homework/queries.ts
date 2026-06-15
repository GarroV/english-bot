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
  student_name: string | null;
  template_topic: string | null;
  template_type: string | null;
}

interface AssignmentJoinRow {
  id: string;
  status: string;
  due_date: string | null;
  folio_students: { name: string } | { name: string }[] | null;
  folio_homework_templates: { topic: string; module_type: string } | { topic: string; module_type: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Workspace assignments (RLS-scoped) with student name + template topic/type, newest first.
export async function listAssignments(): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .select("id, status, due_date, folio_students(name), folio_homework_templates(topic, module_type)")
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(`listAssignments failed: ${error.message}`);
  return ((data as AssignmentJoinRow[]) ?? []).map((r) => {
    const student = one(r.folio_students);
    const tpl = one(r.folio_homework_templates);
    return {
      id: r.id,
      status: r.status,
      due_date: r.due_date,
      student_name: student?.name ?? null,
      template_topic: tpl?.topic ?? null,
      template_type: tpl?.module_type ?? null,
    };
  });
}
