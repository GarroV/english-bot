import { sendMessage, answerCallbackQuery, editMessageText } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import { detectModule, extractParams } from "../lib/module_detect.ts";
import { buildClarifyMessage } from "./clarify.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Handle free-form text in WAITING_REQUEST state: detect module, enter CLARIFYING
export async function handleRequest(message: TgMessage): Promise<void> {
  const userInput = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const userId = message.from.id;

  const moduleType = detectModule(userInput);
  const params = extractParams(userInput);

  await setSession(userId, "CLARIFYING", {
    last_request: userInput,
    module_type: moduleType,
    params,
  });

  const { text, kb } = buildClarifyMessage(moduleType, params);
  await sendMessage(chatId, text, kb);
}

// Handle the "change_request" callback button: go back to WAITING_REQUEST
export async function handleChangeRequest(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "WAITING_REQUEST");
  await editMessageText(
    query.message.chat.id,
    query.message.message_id,
    "Напиши новый запрос:"
  );
}
