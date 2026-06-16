import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth/login-tokens";
import { mintSessionForUser } from "@/lib/auth/session";
import { registerTutorFromInvite } from "@/lib/auth/register";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  try {
    const consumed = await consumeLoginToken(token);
    if (!consumed) return NextResponse.json({ error: "not redeemable" }, { status: 401 });

    let email: string | null = null;
    if (consumed.folioUserId) {
      // Existing user → normal login.
      const admin = createAdminClient();
      const { data: user } = await admin
        .from("folio_users").select("email").eq("id", consumed.folioUserId).maybeSingle();
      email = (user?.email as string | null) ?? null;
      if (!email) return NextResponse.json({ error: "user has no email" }, { status: 409 });
    } else if (consumed.signupInviteId && consumed.telegramId) {
      // Registration → provision a new tutor + workspace from the invite.
      email = await registerTutorFromInvite({
        inviteId: consumed.signupInviteId,
        telegramId: consumed.telegramId,
        name: consumed.tgFirstName ?? "Репетитор",
      });
      if (!email) return NextResponse.json({ error: "registration failed" }, { status: 409 });
    } else {
      return NextResponse.json({ error: "not redeemable" }, { status: 401 });
    }

    const ok = await mintSessionForUser(email);
    if (!ok) return NextResponse.json({ error: "session mint failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
