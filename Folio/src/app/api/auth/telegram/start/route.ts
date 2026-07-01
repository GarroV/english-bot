import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createLoginToken, loginNonceCookieName } from "@/lib/auth/login-tokens";
import { validateSignupInvite } from "@/lib/auth/signup-invites";

export async function POST(request: NextRequest) {
  try {
    // Optional: an invite token (registration). Empty body (normal login) → no invite.
    const body = (await request.json().catch(() => null)) as { inviteToken?: unknown } | null;
    const inviteToken = typeof body?.inviteToken === "string" ? body.inviteToken : null;

    let signupInviteId: string | undefined;
    if (inviteToken) {
      const invite = await validateSignupInvite(inviteToken);
      if (!invite) return NextResponse.json({ error: "invalid invite" }, { status: 400 });
      signupInviteId = invite.id;
    }

    const created = await createLoginToken(signupInviteId);
    // Bind the token to THIS browser (#4): the nonce lives only in an httpOnly cookie; /session
    // redeems the token only if it presents the matching cookie. Never returned in the JSON body.
    const res = NextResponse.json({ token: created.token, deepLink: created.deepLink });
    res.cookies.set(loginNonceCookieName(created.token), created.nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60, // matches the token TTL
    });
    return res;
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
