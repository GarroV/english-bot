import type { InlineKeyboard, InlineKeyboardButton } from "./types.ts";

const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("TELEGRAM_BOT_TOKEN env var is not set");
const BASE = `https://api.telegram.org/bot${token}`;

async function call(method: string, body: object): Promise<void> {
  await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text && { text }),
  });
}

export async function sendDocument(
  chatId: number,
  filename: string,
  bytes: Uint8Array,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([bytes]), filename);
  if (caption) form.append("caption", caption);
  await fetch(`${BASE}/sendDocument`, { method: "POST", body: form });
}

// keyboard([["✅ Use this", "use_cached"], ["🔄 New", "generate_new"]])
// Each inner array is one row of buttons.
export function keyboard(rows: [string, string][][]): InlineKeyboard {
  return {
    inline_keyboard: rows.map((row) =>
      row.map(([text, callback_data]): InlineKeyboardButton => ({
        text,
        callback_data,
      }))
    ),
  };
}
