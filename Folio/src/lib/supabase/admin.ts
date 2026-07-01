import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (secret key). The `server-only` import above makes any accidental
// import from a Client Component a build-time error, not just a convention. Never expose the secret key.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
