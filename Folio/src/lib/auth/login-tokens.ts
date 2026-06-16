import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRedeemable, type LoginTokenStatus } from "@/lib/auth/token-rules";

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TABLE = "folio_login_tokens";

export interface CreatedToken {
  token: string;
  deepLink: string;
}

// Create a pending login token and return the Telegram deep-link to confirm it.
// Pass signupInviteId for the registration flow (bot confirms without an existing user).
export async function createLoginToken(signupInviteId?: string): Promise<CreatedToken> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const admin = createAdminClient();

  const { error } = await admin.from(TABLE).insert({
    token,
    status: "pending",
    expires_at: expiresAt,
    ...(signupInviteId ? { signup_invite_id: signupInviteId } : {}),
  });
  if (error) throw new Error(`createLoginToken failed: ${error.message}`);

  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!;
  return { token, deepLink: `https://t.me/${bot}?start=folio_login_${token}` };
}

// Return only the status (no sensitive data) for the polling endpoint.
export async function getLoginTokenStatus(token: string): Promise<LoginTokenStatus | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("status")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`getLoginTokenStatus failed: ${error.message}`);
  return (data?.status as LoginTokenStatus) ?? null;
}

export interface ConsumedToken {
  folioUserId: string | null;     // set → existing-user login
  signupInviteId: string | null;  // set (and no folioUserId) → registration
  telegramId: number | null;
  tgFirstName: string | null;
}

// Atomically consume a confirmed token; returns its redemption payload or null if
// not redeemable. The caller mints a session (folioUserId) or registers (signupInviteId).
export async function consumeLoginToken(token: string): Promise<ConsumedToken | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("status, expires_at, consumed_at, folio_user_id, signup_invite_id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`consumeLoginToken read failed: ${error.message}`);
  if (!data || !isRedeemable(data, Date.now())) return null;

  // Guard against double-consume (consumed_at IS NULL) and the read→update expiry
  // window (status still confirmed, not yet expired) — all enforced atomically in SQL.
  const { data: updated, error: updErr } = await admin
    .from(TABLE)
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("token", token)
    .eq("status", "confirmed")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("folio_user_id, signup_invite_id, telegram_id, tg_first_name")
    .maybeSingle();
  if (updErr) throw new Error(`consumeLoginToken update failed: ${updErr.message}`);
  if (!updated) return null;
  return {
    folioUserId: (updated.folio_user_id as string | null) ?? null,
    signupInviteId: (updated.signup_invite_id as string | null) ?? null,
    telegramId: (updated.telegram_id as number | null) ?? null,
    tgFirstName: (updated.tg_first_name as string | null) ?? null,
  };
}
