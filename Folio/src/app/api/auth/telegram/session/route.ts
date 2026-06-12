import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth/login-tokens";
import { mintSessionForUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  try {
    const userId = await consumeLoginToken(token);
    if (!userId) return NextResponse.json({ error: "not redeemable" }, { status: 401 });

    const admin = createAdminClient();
    const { data: user } = await admin
      .from("folio_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (!user?.email) return NextResponse.json({ error: "user has no email" }, { status: 409 });

    const ok = await mintSessionForUser(user.email);
    if (!ok) return NextResponse.json({ error: "session mint failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
