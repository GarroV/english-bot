import { sendMessage, setMyCommands } from "../lib/telegram.ts";
import { createInviteCode, listUsers, getUsageThisMonth } from "../lib/db.ts";
import { usageCostUsd } from "../lib/pricing.ts";
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
    (u) => `• ${u.name}${u.username ? ` (@${u.username})` : ""} — ${u.telegram_id}`
  );
  await sendMessage(message.chat.id, `Пользователи (${users.length}):\n\n${lines.join("\n")}`);
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
