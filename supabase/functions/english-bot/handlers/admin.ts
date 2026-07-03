import { sendMessage, setMyCommands } from "../lib/telegram.ts";
import { createInviteCode, listUsers, getUsageThisMonth, revokeAccess, restoreAccess } from "../lib/db.ts";
import { usageCostUsd } from "../lib/pricing.ts";
import { parseTargetTelegramId } from "../lib/utils.ts";
import { ADMIN_ID } from "../lib/config.ts";
import type { TgMessage } from "../lib/types.ts";

function isAdmin(userId: number): boolean {
  return userId === ADMIN_ID;
}

export async function handleInvite(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const code = await createInviteCode(message.from.id);
  await sendMessage(
    message.chat.id,
    `Инвайт-код: \`${code}\`\n\nОднократный — передай пользователю. Они вводят его после /start.`
  );
}

// Register bot commands in the Telegram side menu (admin only, run once after deploy)
export async function handleSetup(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  await setMyCommands([
    { command: "start", description: "Запустить бота" },
    { command: "new", description: "Новое задание" },
    { command: "help", description: "Как пользоваться" },
  ]);
  await sendMessage(message.chat.id, "Меню команд обновлено.");
}

export async function handleUsers(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const users = await listUsers();
  if (users.length === 0) {
    await sendMessage(message.chat.id, "Нет зарегистрированных пользователей.");
    return;
  }
  const lines = users.map(
    (u) =>
      `• ${u.name}${u.username ? ` (@${u.username})` : ""} — ${u.telegram_id}` +
      (u.disabled_at ? " — 🚫 отключён" : "")
  );
  await sendMessage(message.chat.id, `Пользователи (${users.length}):\n\n${lines.join("\n")}`);
}

// /revoke <telegram_id> — soft-revoke a user's access to both the bot and Folio (admin only).
// Reversible: /restore re-activates. No data is deleted.
export async function handleRevoke(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const targetId = parseTargetTelegramId(message.text ?? "");
  if (targetId === null) {
    await sendMessage(message.chat.id, "Формат: `/revoke <telegram_id>`\nНапр.: `/revoke 123456789`");
    return;
  }
  const { bot, folio } = await revokeAccess(targetId);
  if (!bot && !folio) {
    await sendMessage(message.chat.id, `Пользователь \`${targetId}\` не найден ни в боте, ни в Folio.`);
    return;
  }
  const parts = [bot ? "бот" : null, folio ? "Folio" : null].filter(Boolean).join(" и ");
  await sendMessage(message.chat.id, `Доступ отозван (${parts}) для \`${targetId}\`. Обратимо: /restore ${targetId}`);
}

// /restore <telegram_id> — mirror of /revoke: re-activate a previously revoked user (admin only).
export async function handleRestore(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const targetId = parseTargetTelegramId(message.text ?? "");
  if (targetId === null) {
    await sendMessage(message.chat.id, "Формат: `/restore <telegram_id>`\nНапр.: `/restore 123456789`");
    return;
  }
  const { bot, folio } = await restoreAccess(targetId);
  if (!bot && !folio) {
    await sendMessage(message.chat.id, `Пользователь \`${targetId}\` не найден ни в боте, ни в Folio.`);
    return;
  }
  const parts = [bot ? "бот" : null, folio ? "Folio" : null].filter(Boolean).join(" и ");
  await sendMessage(message.chat.id, `Доступ восстановлен (${parts}) для \`${targetId}\`.`);
}

// /usage — сводка расхода LLM за текущий месяц по пользователям (admin only, #23 Фаза 1)
export async function handleUsage(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const rows = await getUsageThisMonth();
  if (rows.length === 0) {
    await sendMessage(message.chat.id, "За этот месяц генераций ещё не было.");
    return;
  }

  const users = await listUsers();
  const nameById = new Map(users.map((u) => [String(u.telegram_id), u.name]));

  const agg = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  let totalCalls = 0;
  let totalCost = 0;
  for (const r of rows) {
    const cost = usageCostUsd(r.model, r);
    const cur = agg.get(r.ref_id) ?? { calls: 0, tokens: 0, costUsd: 0 };
    cur.calls += 1;
    cur.tokens += r.input_tokens + r.output_tokens;
    cur.costUsd += cost;
    agg.set(r.ref_id, cur);
    totalCalls += 1;
    totalCost += cost;
  }

  const lines = [...agg.entries()]
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .map(([ref, s]) => `• ${nameById.get(ref) ?? ref}: ${s.calls} ген · ${s.tokens} ток · ~$${s.costUsd.toFixed(2)}`);

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await sendMessage(
    message.chat.id,
    `*Расход LLM за ${month}*\nВсего: ${totalCalls} ген · ~$${totalCost.toFixed(2)}\n\n${lines.join("\n")}`,
  );
}
