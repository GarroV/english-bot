"use server";

import { createClient } from "@/lib/supabase/server";

export type FeedbackResult = { ok: true } | { ok: false; error: "rate_limited" | "failed" };

const CATEGORIES = ["bug", "idea", "other"] as const;
export type FeedbackCategory = (typeof CATEGORIES)[number];

// Отправка отзыва владельцу (#67): auth-гейт, профиль из собственной строки folio_users,
// затем Edge Function folio-feedback (секрет-гейт) — она пишет folio_feedback и шлёт Telegram.
export async function sendFeedback(category: FeedbackCategory, message: string): Promise<FeedbackResult> {
  if (!CATEGORIES.includes(category)) return { ok: false, error: "failed" };
  const text = message.trim();
  if (!text || text.length > 2000) return { ok: false, error: "failed" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "failed" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id, name").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return { ok: false, error: "failed" };

  // URL функции выводится из FOLIO_GENERATE_URL (тот же проект Supabase) — отдельный env не нужен.
  const url = process.env.FOLIO_GENERATE_URL!.replace("folio-generate", "folio-feedback");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
      body: JSON.stringify({
        workspaceId: profile.workspace_id,
        userId: user.id,
        userName: (profile.name as string | null) ?? "",
        category,
        message: text,
      }),
    });
    if (res.status === 429) return { ok: false, error: "rate_limited" };
    if (!res.ok) return { ok: false, error: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
