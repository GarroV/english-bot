"use server";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperAdmin } from "./guard";

export type AdminResult = { ok: true; token?: string } | { ok: false; error: string };

// Create a signup invite (super-admin only). Returns the raw token; the client builds
// the full /invite/<token> link from its own origin.
export async function createSignupInvite(input: { note?: string; ttlDays?: number }): Promise<AdminResult> {
  const sa = await getSuperAdmin();
  if (!sa) return { ok: false, error: "forbidden" };

  const raw = Number(input.ttlDays);
  const ttlDays = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 90) : 14;
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("folio_signup_invites").insert({
    token,
    role: "tutor",
    note: input.note?.trim() || null,
    status: "pending",
    created_by: sa.userId,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token };
}

// Revoke a still-pending invite (super-admin only). Used invites are kept for audit.
export async function revokeSignupInvite(id: string): Promise<AdminResult> {
  const sa = await getSuperAdmin();
  if (!sa) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folio_signup_invites").delete().eq("id", id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found or already used" };
  return { ok: true };
}
