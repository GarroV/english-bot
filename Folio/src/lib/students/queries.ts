import { createClient } from "@/lib/supabase/server";

export interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  telegram_id: number | null;
  default_rate: number | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

// List students for the caller's workspace (RLS-scoped). Active only unless includeArchived.
export async function listStudents(includeArchived: boolean): Promise<StudentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("folio_students")
    .select("id, name, email, telegram_id, default_rate, notes, archived_at, created_at")
    .order("created_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`listStudents failed: ${error.message}`);
  return (data as StudentRow[]) ?? [];
}
