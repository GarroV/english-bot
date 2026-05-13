import { sendMessage, answerCallbackQuery, keyboard } from "../lib/telegram.ts";
import { getSession, setSession } from "../lib/db.ts";
import { applyEdit } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery, TgMessage } from "../lib/types.ts";

export async function handleEditAssignment(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "EDITING");
  await sendMessage(query.message.chat.id, "Что именно поправить? Опиши изменения:");
}

export async function handleApplyEdit(message: TgMessage): Promise<void> {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const editRequest = message.text?.trim() ?? "";

  const session = await getSession(userId);
  const original = session?.context.current_assignment ?? "";

  await sendMessage(chatId, "Вношу правки...");

  const edited = await applyEdit(original, editRequest);

  // Save to session only — edited versions are not added to the shared cache
  await setSession(userId, "POST_GENERATION", { current_assignment: edited });

  const kb = keyboard([
    [["✏️ Поправить что-то", "edit_assignment"]],
    [["📄 Скачать PDF", "download_pdf"]],
  ]);

  const [first, second] = splitIfLong(edited);
  if (second !== null) {
    await sendMessage(chatId, first);
    await sendMessage(chatId, second, kb);
  } else {
    await sendMessage(chatId, first, kb);
  }
}
