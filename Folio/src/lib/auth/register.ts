import { createAdminClient } from "@/lib/supabase/admin";
import { seedDemoWorkspace } from "./demo-seed";

// Provision a brand-new tutor + workspace from a confirmed signup invite, seed demo
// data, and return the synthetic email to mint a session for. Returns null on failure.
// The Telegram id is trusted (written onto the login token by the bot via service role).
export async function registerTutorFromInvite(opts: {
  inviteId: string;
  telegramId: number;
  name: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { inviteId, telegramId } = opts;
  const name = opts.name.trim() || "Репетитор";

  // 0) If this Telegram is already a Folio user, log into it — never duplicate. Don't touch the invite.
  const { data: existing } = await admin
    .from("folio_auth_methods")
    .select("user_id")
    .eq("provider", "telegram")
    .eq("provider_uid", String(telegramId))
    .maybeSingle();
  if (existing) {
    const { data: u } = await admin
      .from("folio_users").select("email").eq("id", existing.user_id).maybeSingle();
    return (u?.email as string | null) ?? null;
  }

  // 1) Atomically consume the invite (pending → used). 0 rows ⇒ race / reused / expired ⇒ abort.
  const { data: consumed } = await admin
    .from("folio_signup_invites")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!consumed) return null;

  const email = `tg${telegramId}@folio.local`;
  let authUserId: string | null = null;
  let workspaceId: string | null = null;
  try {
    // 2) auth user (passwordless, email confirmed). The admin API populates the GoTrue
    // token columns correctly (the raw-SQL seed had to set them to '' manually).
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, telegram_id: telegramId },
    });
    if (cErr || !created?.user) throw new Error(cErr?.message ?? "createUser failed");
    authUserId = created.user.id;

    // 3) workspace
    const { data: ws, error: wErr } = await admin
      .from("folio_workspaces").insert({ name }).select("id").single();
    if (wErr || !ws) throw new Error(wErr?.message ?? "workspace insert failed");
    workspaceId = ws.id as string;

    // 4) folio user (id == auth user id, so folio_current_workspace_id() resolves)
    const { error: uErr } = await admin.from("folio_users").insert({
      id: authUserId, workspace_id: workspaceId, role: "tutor", name, email, telegram_id: telegramId,
    });
    if (uErr) throw new Error(uErr.message);

    // 5) workspace owner + 6) telegram auth method
    await admin.from("folio_workspaces").update({ owner_id: authUserId }).eq("id", workspaceId);
    const { error: amErr } = await admin
      .from("folio_auth_methods")
      .insert({ user_id: authUserId, provider: "telegram", provider_uid: String(telegramId) });
    if (amErr) throw new Error(amErr.message);

    // 7) demo data (best-effort — never blocks registration)
    try {
      await seedDemoWorkspace(admin, workspaceId, authUserId);
    } catch (e) {
      console.error(`registerTutorFromInvite: demo seed failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 8) record who used the invite
    await admin.from("folio_signup_invites").update({ used_by: authUserId }).eq("id", inviteId);

    return email;
  } catch (e) {
    console.error(`registerTutorFromInvite failed: ${e instanceof Error ? e.message : String(e)}`);
    // Roll back partial state. Clear owner_id first (FK) so deleting the user can cascade
    // folio_users; then drop the workspace; then revert the invite so the link can be retried.
    if (workspaceId) await admin.from("folio_workspaces").update({ owner_id: null }).eq("id", workspaceId).then(() => {}, () => {});
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).then(() => {}, () => {});
    if (workspaceId) await admin.from("folio_workspaces").delete().eq("id", workspaceId).then(() => {}, () => {});
    await admin.from("folio_signup_invites").update({ status: "pending", used_at: null }).eq("id", inviteId).then(() => {}, () => {});
    return null;
  }
}
