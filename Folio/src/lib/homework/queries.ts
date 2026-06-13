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
