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

// Мягкий отзыв/восстановление доступа репетитора (super-admin only) — зеркало bot-команд
// /revoke//restore: disabled_at в folio_users (Folio блокируется через RLS-null воркспейса)
// и, если привязан Telegram, в eb_users (гейт бота isAllowed). Данные не трогаются.
export async function setTutorAccess(folioUserId: string, disabled: boolean): Promise<AdminResult> {
  const sa = await getSuperAdmin();
  if (!sa) return { ok: false, error: "forbidden" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folioUserId)) {
    return { ok: false, error: "bad id" };
  }
  // Самоблокировка выпилила бы супер-админа из админки (восстановление — только через бота).
  if (folioUserId === sa.userId) return { ok: false, error: "cannot revoke yourself" };

  const admin = createAdminClient();
  const disabledAt = disabled ? new Date().toISOString() : null;
  const { data: rows, error } = await admin
    .from("folio_users").update({ disabled_at: disabledAt }).eq("id", folioUserId).select("telegram_id");
  if (error) return { ok: false, error: error.message };
  if (!rows || rows.length === 0) return { ok: false, error: "not found" };

  const telegramId = rows[0].telegram_id as number | null;
  if (telegramId != null) {
    const { error: botErr } = await admin
      .from("eb_users").update({ disabled_at: disabledAt }).eq("telegram_id", telegramId);
    // Folio уже переключён; половинчатое состояние называем явно, чтобы админ повторил действие.
    if (botErr) return { ok: false, error: `folio ok, bot failed: ${botErr.message}` };
  }
  return { ok: true };
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
