import { sendMessage } from "../lib/telegram.ts";
import { createInviteCode, listUsers } from "../lib/db.ts";
import type { TgMessage } from "../lib/types.ts";

const ADMIN_ID = Number(Deno.env.get("ADMIN_USER_ID")!);

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
