import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Request-scoped Supabase client that reads/writes the auth cookies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; proxy refreshes cookies.
          }
        },
      },
    },
  );
}

// Demo variant: same as createClient, but forces the auth cookies to SameSite=None; Secure so
// they survive inside a cross-site iframe — the portfolio window on garrov.github.io embeds the
// live demo. Used ONLY by the /api/auth/demo login route; real users keep the default (Lax) cookies.
export async function createDemoClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, sameSite: "none", secure: true }),
            );
          } catch {
            // Called from a Server Component — safe to ignore; proxy refreshes cookies.
          }
        },
      },
    },
  );
}
