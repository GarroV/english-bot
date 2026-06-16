import { createClient } from "@/lib/supabase/server";

export interface SuperAdmin {
  userId: string;
}

// Returns the current user iff they are a super_admin, else null. Reads the role from
// folio_users via the request-scoped client (own row, RLS-allowed). Gate the admin page
// AND every admin server action with this — never trust the client.
export async function getSuperAdmin(): Promise<SuperAdmin | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("folio_users").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "super_admin" ? { userId: user.id } : null;
}
