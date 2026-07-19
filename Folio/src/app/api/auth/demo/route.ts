import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionDemo, DEMO_EMAIL, DEMO_KEY } from "@/lib/auth/demo";
import { mintSessionForUser } from "@/lib/auth/session";

// Live demo login for the portfolio window. Verifies the (public, light) key, provisions the shared
// demo tutor + English workspace on first hit, mints a cross-site (SameSite=None) Supabase session,
// and drops the visitor straight into the English dashboard — inside the garrov.github.io iframe.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== DEMO_KEY) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const admin = createAdminClient();
  const userId = await provisionDemo(admin);
  if (!userId) return new NextResponse("Demo temporarily unavailable", { status: 503 });

  const ok = await mintSessionForUser(DEMO_EMAIL, /* crossSite */ true);
  if (!ok) return new NextResponse("Demo login failed", { status: 500 });

  return NextResponse.redirect(new URL("/en/dashboard", url.origin));
}
