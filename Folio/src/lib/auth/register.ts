import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedDemoWorkspace } from "./demo-seed";

// Create the passwordless auth user. If a synthetic-email orphan from a prior failed
// attempt exists (an auth user with no folio_users row), delete it and retry once —
// otherwise the UNIQUE synthetic email would permanently brick this Telegram id.
async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  name: string,
  telegramId: number,
): Promise<string | null> {
  const make = () =>
    admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name, telegram_id: telegramId } });

  const first = await make();
  if (first.data?.user) return first.data.user.id;

  const msg = first.error?.message ?? "";
  if (!/already|registered|exists|duplicate/i.test(msg)) {
    console.error(`createAuthUser: createUser failed for ${email}: ${msg}`);
    return null;
  }

  // Email is taken. Clean it ONLY if it's a true orphan (no folio_users row); never
  // touch a complete account — fail closed instead.
  const orphanId = await findAuthUserIdByEmail(admin, email);
  if (!orphanId) return null;
  const { data: fu } = await admin.from("folio_users").select("id").eq("id", orphanId).maybeSingle();
  if (fu) {
    console.error(`createAuthUser: ${email} already belongs to a complete account; refusing`);
    return null;
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(orphanId);
  if (delErr) {
    console.error(`createAuthUser: could not clear orphan ${orphanId}: ${delErr.message}`);
    return null;
  }
  const retry = await make();
  return retry.data?.user?.id ?? null;
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  // Folio is single-digit tutors; scan a few pages defensively.
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email === email);
    if (found) return found.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

// Provision a brand-new tutor + workspace from a confirmed signup invite, seed demo
// data, and return the synthetic email to mint a session for. Returns null on failure.
// The Telegram id is trusted (written onto the login token by the bot via service role).
//
// Atomicity: the invite is consumed in the SAME DB transaction that creates the
// workspace/user/owner/auth-method (folio_register_tutor RPC). The invite is therefore
// strictly single-use and is NEVER reverted to pending on failure — if the tx fails,
// nothing was created and the invite is untouched (fail closed). The only non-DB step
// is the auth-user creation, which is orphan-safe and dropped if the RPC loses the race.
export async function registerTutorFromInvite(opts: {
  inviteId: string;
  telegramId: number;
  name: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { inviteId, telegramId } = opts;
  const name = opts.name.trim() || "Репетитор";
  const email = `tg${telegramId}@folio.local`;

  // 0) Already a Folio user for this Telegram → log into it; never duplicate, never consume the invite.
  const { data: existing } = await admin
    .from("folio_auth_methods")
    .select("user_id")
    .eq("provider", "telegram")
    .eq("provider_uid", String(telegramId))
    .maybeSingle();
  if (existing) {
    const { data: u } = await admin.from("folio_users").select("email").eq("id", existing.user_id).maybeSingle();
    return (u?.email as string | null) ?? null;
  }

  // 1) Create the auth user (GoTrue — outside the DB transaction), orphan-safe.
  const authUserId = await createAuthUser(admin, email, name, telegramId);
  if (!authUserId) return null;

  // 2) Atomically consume the invite + create workspace/user/owner/auth-method in ONE tx.
  // wsId is null if the invite was no longer pending (lost the race) → nothing was created.
  const { data: wsId, error: rpcErr } = await admin.rpc("folio_register_tutor", {
    p_invite_id: inviteId,
    p_auth_user_id: authUserId,
    p_telegram_id: telegramId,
    p_name: name,
    p_email: email,
  });
  if (rpcErr || !wsId) {
    console.error(
      `registerTutorFromInvite: provisioning failed (${rpcErr?.message ?? "invite not pending"}); dropping unused auth user ${authUserId}`,
    );
    const { error: delErr } = await admin.auth.admin.deleteUser(authUserId);
    if (delErr) console.error(`registerTutorFromInvite: orphan auth user ${authUserId} (${email}) left behind: ${delErr.message}`);
    return null;
  }

  // 3) Demo data — best-effort; the registration is already committed and must not fail here.
  try {
    await seedDemoWorkspace(admin, wsId as string, authUserId);
  } catch (e) {
    console.error(`registerTutorFromInvite: demo seed failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return email;
}
