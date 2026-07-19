import type { SupabaseClient } from "@supabase/supabase-js";
import { seedDemoWorkspaceEn } from "./demo-seed";

// Portfolio demo account. The live Folio app is embedded in an iframe on garrov.github.io so a
// visitor can actually use the product. This module provisions (idempotently) a single shared demo
// tutor + workspace with a small ENGLISH dataset, and the /api/auth/demo route mints a cross-site
// session for it. Everything is isolated to this one workspace; real tutors are untouched.

export const DEMO_EMAIL = "portfolio-demo@folio.local";
const DEMO_NAME = "Alex Rivera";

// Light gate for the demo login link (the key is embedded in the public portfolio HTML, so this is
// a speed-bump, not a secret). Overridable via a Worker env var without a code change.
export const DEMO_KEY = process.env.FOLIO_DEMO_KEY ?? "f0l1odemo7b3c1a9e2d4f6081bd5e7a3";

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  // Folio is single-digit tutors; scan a few pages defensively (same approach as register.ts).
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email === email);
    if (found) return found.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

// Ensure the demo auth user + workspace + English seed exist. Idempotent: safe to call on every
// demo login. Returns the auth user id to mint a session for, or null on failure.
export async function provisionDemo(admin: SupabaseClient): Promise<string | null> {
  // 1) Auth user (GoTrue) — passwordless, email confirmed so magiclink works.
  let userId = await findAuthUserIdByEmail(admin, DEMO_EMAIL);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      email_confirm: true,
      user_metadata: { name: DEMO_NAME },
    });
    if (error || !data?.user) {
      console.error(`provisionDemo: createUser failed: ${error?.message ?? "no user"}`);
      return null;
    }
    userId = data.user.id;
  }

  // 2) Folio workspace + tutor row (mirrors folio_register_tutor, minus invite/telegram). language
  // is 'en' so the demo tutor's app is English end-to-end.
  const { data: fu } = await admin
    .from("folio_users")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  let workspaceId = (fu as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) {
    const { data: ws, error: wsErr } = await admin
      .from("folio_workspaces")
      .insert({ name: "Folio — Demo" })
      .select("id")
      .single();
    if (wsErr || !ws) {
      console.error(`provisionDemo: workspace insert failed: ${wsErr?.message ?? "no id"}`);
      return null;
    }
    workspaceId = ws.id as string;
    const { error: uErr } = await admin.from("folio_users").insert({
      id: userId,
      workspace_id: workspaceId,
      role: "tutor",
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      language: "en",
    });
    if (uErr) {
      console.error(`provisionDemo: folio_users insert failed: ${uErr.message}`);
      return null;
    }
    await admin.from("folio_workspaces").update({ owner_id: userId }).eq("id", workspaceId);
  }

  // 3) English demo data — only if the workspace is empty (don't duplicate on repeat logins).
  const { count } = await admin
    .from("folio_students")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (!count) {
    try {
      await seedDemoWorkspaceEn(admin, workspaceId, userId);
    } catch (e) {
      console.error(`provisionDemo: seed failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return userId;
}
