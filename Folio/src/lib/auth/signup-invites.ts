import { createAdminClient } from "@/lib/supabase/admin";

const TABLE = "folio_signup_invites";

export interface SignupInvite {
  id: string;
  role: string;
  note: string | null;
}

// Validate a signup-invite token: must be pending and not expired. Returns it or null.
// Service-role read (the table has no RLS policies).
export async function validateSignupInvite(token: string): Promise<SignupInvite | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("id, role, note, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`validateSignupInvite failed: ${error.message}`);
  if (!data || data.status !== "pending" || Date.parse(data.expires_at as string) <= Date.now()) {
    return null;
  }
  return { id: data.id as string, role: data.role as string, note: (data.note as string | null) ?? null };
}
