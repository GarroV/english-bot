import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

// Establish a Supabase session for an existing auth user by email.
// Admin generates a magic-link OTP hash; the request-scoped client verifies it,
// which writes the auth cookies. Returns true on success.
export async function mintSessionForUser(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) return false;

  const supabase = await createServerSupabase();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  return !verifyErr;
}
