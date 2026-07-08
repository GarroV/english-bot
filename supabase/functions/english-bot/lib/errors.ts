// Compact alert about an unhandled error for the admin: who, what they sent, what broke (truncated).
export function formatAdminAlert(
  e: unknown,
  ctx: { userId?: number | null; chatId?: number | null; hint?: string | null },
): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const lines = ["⚠️ Ошибка в боте"];
  if (ctx.userId != null) lines.push(`user: ${ctx.userId}`);
  if (ctx.chatId != null && ctx.chatId !== ctx.userId) lines.push(`chat: ${ctx.chatId}`);
  if (ctx.hint) lines.push(`ввод: ${clip(ctx.hint, 120)}`);
  lines.push(clip(err, 500));
  return lines.join("\n");
}

// Map a raw LLM/Anthropic error to a short, user-facing Russian message. Shared by the bot handlers.
export function friendlyError(e: unknown): string {
  const msg = String(e);
  if (msg.includes("credit balance") || msg.includes("too low")) {
    return "На счёте закончились кредиты Anthropic. Пополни баланс и попробуй снова.";
  }
  if (msg.includes("rate_limit") || msg.includes("429")) {
    return "Слишком много запросов. Подожди минуту и попробуй снова.";
  }
  if (msg.includes("401") || msg.includes("authentication")) {
    return "Ошибка авторизации API. Обратись к администратору.";
  }
  return "Что-то пошло не так. Попробуй ещё раз через минуту.";
}
