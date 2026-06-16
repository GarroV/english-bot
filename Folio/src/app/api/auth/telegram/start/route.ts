import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createLoginToken } from "@/lib/auth/login-tokens";
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
    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
