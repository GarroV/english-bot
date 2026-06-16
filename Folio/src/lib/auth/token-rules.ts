export type LoginTokenStatus = "pending" | "confirmed" | "consumed";

export interface LoginTokenRow {
  status: LoginTokenStatus;
  expires_at: string;
  consumed_at: string | null;
  folio_user_id: string | null;
  signup_invite_id: string | null;
}

// A token can be exchanged for a session only when it is confirmed by the bot,
// not yet consumed, and not expired — AND it either links to an existing folio user
// (normal login) or carries a signup invite (registration; user created on redemption).
export function isRedeemable(row: LoginTokenRow, nowMs: number): boolean {
  if (row.status !== "confirmed") return false;
  if (row.consumed_at !== null) return false;
  if (!row.folio_user_id && !row.signup_invite_id) return false;
  return Date.parse(row.expires_at) > nowMs;
}
