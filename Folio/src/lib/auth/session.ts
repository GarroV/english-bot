import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase, createDemoClient } from "@/lib/supabase/server";

// Establish a Supabase session for an existing auth user by email.
// Admin generates a magic-link OTP hash; the request-scoped client verifies it,
// which writes the auth cookies. `crossSite` uses SameSite=None;Secure cookies so the
// session survives inside the portfolio's cross-site iframe (demo login only).
// Returns true on success.
export async function mintSessionForUser(email: string, crossSite = false): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) return false;

  const supabase = crossSite ? await createDemoClient() : await createServerSupabase();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  return !verifyErr;
}
