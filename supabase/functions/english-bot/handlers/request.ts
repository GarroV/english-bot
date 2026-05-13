import { sendMessage, editMessageText, answerCallbackQuery, keyboard } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Handle the user's text input when they're in WAITING_REQUEST state
export async function handleRequest(message: TgMessage): Promise<void> {
  const userInput = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const userId = message.from.id;

  await setSession(userId, "CONFIRMING", { last_request: userInput });

  const kb = keyboard([
    [["✅ Генерировать", "confirm"]],
    [["✏️ Изменить запрос", "change_request"]],
  ]);

  await sendMessage(
    chatId,
    `Запрос:\n*${userInput}*\n\nУбедитесь, что указан уровень (A1/A2/B1/B2/C1), тема и возраст ученика.\n\nВсё верно?`,
    kb
  );
}

// Handle the "change_request" callback button to go back to WAITING_REQUEST state
export async function handleChangeRequest(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "WAITING_REQUEST");
  await editMessageText(
    query.message.chat.id,
    query.message.message_id,
    "Напиши новый запрос (уровень, тема, возраст):"
  );
}
