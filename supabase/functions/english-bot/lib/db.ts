import { createClient } from "npm:@supabase/supabase-js@2";
import type { State, DbSession, DbUser, DbAssignment, SessionContext } from "./types.ts";
import { generateInviteCode } from "./utils.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Supabase.ai.Session is a global available only in the Deno Edge Runtime
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run(
        input: string,
        options: { mean_pool: boolean; normalize: boolean }
      ): Promise<{ data: Float32Array }>;
    };
  };
};

// Generate a vector embedding for the given text using the gte-small model
async function embed(text: string): Promise<number[] | null> {
  try {
    const session = new Supabase.ai.Session("gte-small");
    const result = await session.run(text, { mean_pool: true, normalize: true });
    return Array.from(result.data);
  } catch (e) {
    console.error("embed() failed:", e);
    return null;
  }
}

// Check whether a Telegram user is registered in the allowlist
export async function isAllowed(telegramId: number): Promise<boolean> {
  const { data } = await supabase
    .from("eb_users")
    .select("telegram_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data !== null;
}

// Insert or update a user record in eb_users
export async function registerUser(
  telegramId: number,
  username: string | undefined,
  name: string,
  invitedBy?: number
): Promise<void> {
  const { error } = await supabase.from("eb_users").upsert({
    telegram_id: telegramId,
    username: username ?? null,
    name,
    invited_by: invitedBy ?? null,
  });
  if (error) throw new Error(`registerUser failed: ${error.message}`);
}

// Fetch the current session row for a Telegram user
export async function getSession(telegramId: number): Promise<DbSession | null> {
  const { data } = await supabase
    .from("eb_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, telegram_id: Number(data.telegram_id) } as DbSession;
}

// Write (upsert) the session state and context for a Telegram user
export async function setSession(
  telegramId: number,
  state: State,
  context: SessionContext = {}
): Promise<void> {
  const { error } = await supabase.from("eb_sessions").upsert({
    telegram_id: telegramId,
    state,
    context,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`setSession failed: ${error.message}`);
}

// Return true if the invite code exists and has not been used yet
export async function validateInvite(code: string): Promise<boolean> {
  const { data } = await supabase
    .from("eb_invitations")
    .select("code, used_by")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data !== null && data.used_by === null;
}

// Return the telegram_id of the user who created the given invite code
export async function getInviteCreator(code: string): Promise<number | null> {
  const { data } = await supabase
    .from("eb_invitations")
    .select("created_by")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data?.created_by != null ? Number(data.created_by) : null;
}

// Atomically claim an invite code for a user. The `.is('used_by', null)` guard makes the UPDATE
// match at most one caller under concurrency (single-statement atomicity), closing the TOCTOU where
// one code could register several users. Returns true if THIS call won the claim, false if already used.
export async function useInvite(code: string, telegramId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("eb_invitations")
    .update({ used_by: telegramId, used_at: new Date().toISOString() })
    .eq("code", code.toUpperCase())
    .is("used_by", null)
    .select("code");
  if (error) throw new Error(`useInvite failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Embed the assignment parameters and store the record with its vector in eb_assignments
export async function saveAssignment(params: {
  telegramId: number;
  level: string;
  topic: string;
  ageGroup: string;
  moduleType: string;
  requestText: string;
  content: string;
}): Promise<void> {
  const embeddingInput = `${params.level} ${params.topic} ${params.ageGroup}`;
  const embedding = await embed(embeddingInput);
  const { error } = await supabase.from("eb_assignments").insert({
    telegram_id: params.telegramId,
    level: params.level,
    topic: params.topic,
    age_group: params.ageGroup,
    module_type: params.moduleType,
    request_text: params.requestText,
    content: params.content,
    embedding,
  });
  if (error) throw new Error(`saveAssignment failed: ${error.message}`);
}

// Use pgvector cosine similarity to find an existing assignment that closely matches the given parameters
export async function findSimilarAssignment(
  level: string,
  topic: string,
  ageGroup: string,
  moduleType: string
): Promise<DbAssignment | null> {
  const embeddingInput = `${level} ${topic} ${ageGroup}`;
  const embedding = await embed(embeddingInput);
  if (!embedding) return null; // AI unavailable — skip cache, generate fresh
  const { data } = await supabase.rpc("match_assignments", {
    query_embedding: embedding,
    match_threshold: 0.85,
    match_count: 1,
    filter_module_type: moduleType,
  });
  return (data?.[0] as DbAssignment) ?? null;
}

// Fetch a single assignment row by its UUID
export async function getAssignment(id: string): Promise<DbAssignment | null> {
  const { data } = await supabase
    .from("eb_assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as DbAssignment | null;
}

// Generate a unique invite code and insert it into eb_invitations
export async function createInviteCode(createdBy: number): Promise<string> {
  const code = generateInviteCode();
  const { error } = await supabase.from("eb_invitations").insert({ code, created_by: createdBy });
  if (error) throw new Error(`createInviteCode failed: ${error.message}`);
  return code;
}

// Fetch the last N assignments for a user, newest first
export async function getUserAssignments(telegramId: number, limit = 5): Promise<DbAssignment[]> {
  const { data } = await supabase
    .from("eb_assignments")
    .select("id, telegram_id, level, topic, age_group, module_type, request_text, created_at")
    .eq("telegram_id", telegramId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as DbAssignment[]) ?? [];
}

// Return all users ordered by registration date, newest first
export async function listUsers(): Promise<DbUser[]> {
  const { data } = await supabase
    .from("eb_users")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as DbUser[]) ?? []).map((u) => ({
    ...u,
    telegram_id: Number(u.telegram_id),
  }));
}

// Confirm a Folio login token for a Telegram user. Returns the outcome for the bot reply.
export async function confirmFolioLogin(
  token: string,
  telegramId: number,
  firstName?: string,
  username?: string,
): Promise<"confirmed" | "not_linked" | "invite_expired" | "invalid"> {
  // 1) token must exist, be pending, and not expired (also read the optional signup invite)
  const { data: tok } = await supabase
    .from("folio_login_tokens")
    .select("id, status, expires_at, signup_invite_id")
    .eq("token", token)
    .maybeSingle();
  if (!tok || tok.status !== "pending" || Date.parse(tok.expires_at) <= Date.now()) {
    return "invalid";
  }

  const tgInfo = {
    telegram_id: telegramId,
    tg_first_name: firstName ?? null,
    tg_username: username ?? null,
    confirmed_at: new Date().toISOString(),
  };
  const confirm = (fields: Record<string, unknown>) =>
    supabase
      .from("folio_login_tokens")
      .update({ status: "confirmed", ...tgInfo, ...fields })
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

  // 2) existing Folio user linked to this Telegram → normal login
  const { data: method } = await supabase
    .from("folio_auth_methods")
    .select("user_id")
    .eq("provider", "telegram")
    .eq("provider_uid", String(telegramId))
    .maybeSingle();
  if (method) {
    const { error } = await confirm({ folio_user_id: method.user_id });
    return error ? "invalid" : "confirmed";
  }

  // 3) no existing user — allowed only if the token carries a still-valid signup invite.
  // folio_user_id stays null; the Folio /session route provisions the new tutor + workspace.
  if (tok.signup_invite_id) {
    const { data: inv } = await supabase
      .from("folio_signup_invites")
      .select("status, expires_at")
      .eq("id", tok.signup_invite_id)
      .maybeSingle();
    if (inv && inv.status === "pending" && Date.parse(inv.expires_at) > Date.now()) {
      const { error } = await confirm({});
      return error ? "invalid" : "confirmed";
    }
    // Token carried an invite, but it is no longer redeemable — distinct from not_linked.
    return "invite_expired";
  }

  return "not_linked";
}

// Resolve the Folio workspace for a Telegram user, if they are a non-archived Folio tutor.
// Uses the same telegram→user link the login flow relies on. Returns the workspace id plus
// the folio_users id (for attribution), or null for unlinked / student / archived users.
export async function resolveFolioWorkspace(
  telegramId: number,
): Promise<{ workspaceId: string; userId: string } | null> {
  const { data: method } = await supabase
    .from("folio_auth_methods")
    .select("user_id")
    .eq("provider", "telegram")
    .eq("provider_uid", String(telegramId))
    .maybeSingle();
  if (!method) return null;

  const { data: user } = await supabase
    .from("folio_users")
    .select("id, workspace_id, role, archived_at")
    .eq("id", method.user_id)
    .maybeSingle();
  if (!user || user.archived_at || user.role === "student") return null;

  return { workspaceId: String(user.workspace_id), userId: String(user.id) };
}

// Mirror a bot-generated assignment into the tutor's Folio template library (source='bot'),
// so it is visible and assignable in the web. No-op ("skipped") for unlinked / non-tutor users
// or empty content. The workspace_id comes from the verified telegram link, never from input.
export async function saveFolioTemplateFromBot(params: {
  telegramId: number;
  moduleType: string;
  level: string;
  ageGroup: string;
  topic: string;
  content: string;
}): Promise<"saved" | "skipped"> {
  if (!params.content.trim() || !params.topic.trim()) return "skipped";

  const ws = await resolveFolioWorkspace(params.telegramId);
  if (!ws) return "skipped";

  const { error } = await supabase.from("folio_homework_templates").insert({
    workspace_id: ws.workspaceId,
    module_type: params.moduleType,
    level: params.level,
    age_group: params.ageGroup,
    topic: params.topic,
    content: params.content,
    source: "bot",
    created_by: ws.userId,
  });
  if (error) throw new Error(`folio template insert failed: ${error.message}`);
  return "saved";
}
