import { createClient } from "npm:@supabase/supabase-js@2";

// Секция фидбека (#67): принимает отзыв репетитора от Folio-сервера (секрет-гейт, как
// folio-generate), сохраняет в folio_feedback и шлёт копию владельцу в Telegram.
// ⚠️ Деплоить ТОЛЬКО с --no-verify-jwt — вызовы идут с x-folio-secret, без JWT.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ["bug", "idea", "other"] as const;
const CATEGORY_RU: Record<string, string> = { bug: "Баг", idea: "Идея", other: "Прочее" };
const RATE_WINDOW_MS = 60_000; // не чаще одного отзыва в минуту на пользователя

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Best-effort уведомление владельцу: сбой Telegram не теряет отзыв (он уже в таблице).
async function notifyAdmin(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const adminId = Number(Deno.env.get("ADMIN_USER_ID"));
  if (!token || !Number.isInteger(adminId)) {
    console.error("feedback notify skipped: TELEGRAM_BOT_TOKEN/ADMIN_USER_ID not set");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: adminId, text }),
    });
    if (!res.ok) console.error(`feedback notify failed: HTTP ${res.status}`);
  } catch (e) {
    console.error("feedback notify failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (req.headers.get("x-folio-secret") !== Deno.env.get("FOLIO_GENERATE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const { workspaceId, userId, userName, category, message } = await req.json();
    if (
      typeof workspaceId !== "string" || !UUID_RE.test(workspaceId) ||
      typeof userId !== "string" || !UUID_RE.test(userId) ||
      typeof userName !== "string" || userName.length > 200 ||
      !CATEGORIES.includes(category) ||
      typeof message !== "string" || !message.trim() || message.length > 2000
    ) {
      return json({ error: "bad request" }, 400);
    }

    // Анти-спам: не чаще раза в минуту на пользователя.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error: cntErr } = await supabase
      .from("folio_feedback")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (cntErr) return json({ error: cntErr.message }, 500);
    if ((count ?? 0) > 0) return json({ error: "rate_limited" }, 429);

    const { error } = await supabase.from("folio_feedback").insert({
      workspace_id: workspaceId,
      user_id: userId,
      category,
      message: message.trim(),
    });
    if (error) return json({ error: error.message }, 500);

    await notifyAdmin(`💬 Отзыв из Folio · ${CATEGORY_RU[category] ?? category}\nОт: ${userName.trim() || "—"}\n\n${message.trim()}`);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "feedback failed" }, 500);
  }
});
