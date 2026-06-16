import { createAdminClient } from "@/lib/supabase/admin";

// Server-only (NOT "use server"): cross-workspace reads via the service-role admin client.
// Only ever called from the /admin page, which gates on getSuperAdmin() first.

export interface SignupInviteRow {
  id: string;
  token: string;
  note: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  used_by_name: string | null;
}

export async function listSignupInvites(): Promise<SignupInviteRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folio_signup_invites")
    .select(
      "id, token, note, status, expires_at, created_at, used_at, used_user:folio_users!folio_signup_invites_used_by_fkey(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listSignupInvites failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const u = Array.isArray(r.used_user) ? r.used_user[0] : r.used_user;
    return {
      id: r.id as string,
      token: r.token as string,
      note: (r.note as string | null) ?? null,
      status: r.status as string,
      expires_at: r.expires_at as string,
      created_at: r.created_at as string,
      used_at: (r.used_at as string | null) ?? null,
      used_by_name: (u?.name as string | undefined) ?? null,
    };
  });
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  created_at: string;
  tutor_name: string | null;
  tutor_telegram: number | null;
  students: number;
  lessons: number;
}

export async function listWorkspacesOverview(): Promise<WorkspaceOverview[]> {
  const admin = createAdminClient();
  const { data: ws, error } = await admin
    .from("folio_workspaces")
    .select("id, name, created_at, owner_id")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listWorkspacesOverview failed: ${error.message}`);

  // N+1 is fine here — Folio has single-digit workspaces; this surface is super-admin-only.
  return Promise.all(
    (ws ?? []).map(async (w) => {
      const owner = w.owner_id
        ? (await admin.from("folio_users").select("name, telegram_id").eq("id", w.owner_id).maybeSingle()).data
        : null;
      const students = (await admin.from("folio_students").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).is("archived_at", null)).count ?? 0;
      const lessons = (await admin.from("folio_lessons").select("*", { count: "exact", head: true }).eq("workspace_id", w.id)).count ?? 0;
      return {
        id: w.id as string,
        name: w.name as string,
        created_at: w.created_at as string,
        tutor_name: (owner?.name as string | undefined) ?? null,
        tutor_telegram: (owner?.telegram_id as number | null) ?? null,
        students,
        lessons,
      };
    }),
  );
}
