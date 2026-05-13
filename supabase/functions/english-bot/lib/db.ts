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
async function embed(text: string): Promise<number[]> {
  const session = new Supabase.ai.Session("gte-small");
  const result = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(result.data);
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
  await supabase.from("eb_users").upsert({
    telegram_id: telegramId,
    username: username ?? null,
    name,
    invited_by: invitedBy ?? null,
  });
}

// Fetch the current session row for a Telegram user
export async function getSession(telegramId: number): Promise<DbSession | null> {
  const { data } = await supabase
    .from("eb_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data as DbSession | null;
}

// Write (upsert) the session state and context for a Telegram user
export async function setSession(
  telegramId: number,
  state: State,
  context: SessionContext = {}
): Promise<void> {
  await supabase.from("eb_sessions").upsert({
    telegram_id: telegramId,
    state,
    context,
    updated_at: new Date().toISOString(),
  });
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
  return (data?.created_by as number) ?? null;
}

// Mark an invite code as used by setting used_by and used_at
export async function useInvite(code: string, telegramId: number): Promise<void> {
  await supabase
    .from("eb_invitations")
    .update({ used_by: telegramId, used_at: new Date().toISOString() })
    .eq("code", code.toUpperCase());
}

// Embed the assignment parameters and store the record with its vector in eb_assignments
export async function saveAssignment(params: {
  telegramId: number;
  level: string;
  topic: string;
  ageGroup: string;
  requestText: string;
  content: string;
}): Promise<void> {
  const embeddingInput = `${params.level} ${params.topic} ${params.ageGroup}`;
  const embedding = await embed(embeddingInput);
  await supabase.from("eb_assignments").insert({
    telegram_id: params.telegramId,
    level: params.level,
    topic: params.topic,
    age_group: params.ageGroup,
    request_text: params.requestText,
    content: params.content,
    embedding,
  });
}

// Use pgvector cosine similarity to find an existing assignment that closely matches the given parameters
export async function findSimilarAssignment(
  level: string,
  topic: string,
  ageGroup: string
): Promise<DbAssignment | null> {
  const embeddingInput = `${level} ${topic} ${ageGroup}`;
  const embedding = await embed(embeddingInput);
  const { data } = await supabase.rpc("match_assignments", {
    query_embedding: embedding,
    match_threshold: 0.85,
    match_count: 1,
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
  await supabase.from("eb_invitations").insert({ code, created_by: createdBy });
  return code;
}

// Return all users ordered by registration date, newest first
export async function listUsers(): Promise<DbUser[]> {
  const { data } = await supabase
    .from("eb_users")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as DbUser[]) ?? [];
}
