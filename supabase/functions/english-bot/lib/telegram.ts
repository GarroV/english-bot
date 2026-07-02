import type { InlineKeyboard, InlineKeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove } from "./types.ts";

const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("TELEGRAM_BOT_TOKEN env var is not set");
const BASE = `https://api.telegram.org/bot${token}`;

interface TgApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

// POST to the Telegram Bot API. Never throws on an expected API error — logs method/status/body
// and returns the parsed response (or null on a network error) so callers can react (e.g. retry).
async function call(method: string, body: object): Promise<TgApiResponse | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`Telegram ${method} network error:`, e);
    return null;
  }
  const json = (await res.json().catch(() => null)) as TgApiResponse | null;
  if (!res.ok || !json?.ok) {
    console.error(`Telegram ${method} failed: HTTP ${res.status} — ${json?.description ?? "(no body)"}`);
  }
  return json;
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard | ReplyKeyboardMarkup | ReplyKeyboardRemove
): Promise<void> {
  const markup = replyMarkup ? { reply_markup: replyMarkup } : {};
  const res = await call("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", ...markup });
  // splitIfLong can slice a Markdown entity pair across chunks → "can't parse entities" (HTTP 400).
  // Retry the chunk as plain text so assignment content (and its keyboard) is never silently lost.
  if (res && !res.ok && res.description?.includes("can't parse entities")) {
    await call("sendMessage", { chat_id: chatId, text, ...markup });
  }
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
  // bytes.slice() yields a fresh ArrayBuffer-backed copy (not SharedArrayBuffer), satisfying BlobPart.
  form.append("document", new Blob([bytes.slice()]), filename);
  if (caption) form.append("caption", caption);
  let res: Response;
  try {
    res = await fetch(`${BASE}/sendDocument`, { method: "POST", body: form });
  } catch (e) {
    console.error("Telegram sendDocument network error:", e);
    throw e;
  }
  if (!res.ok) {
    const desc = await res.text().catch(() => "(no body)");
    console.error(`Telegram sendDocument failed: HTTP ${res.status} — ${desc}`);
    throw new Error(`sendDocument failed: HTTP ${res.status}`);
  }
}

// Register bot commands that appear in the Telegram side menu
export async function setMyCommands(
  commands: { command: string; description: string }[]
): Promise<void> {
  await call("setMyCommands", { commands });
}

// Public Folio web URL (override via FOLIO_WEB_URL; not a secret).
const FOLIO_URL = Deno.env.get("FOLIO_WEB_URL") ?? "https://folio.vasiliy-garro.workers.dev";

// Inline keyboard with a single button that opens the Folio web app in the browser.
export function siteLink(): InlineKeyboard {
  return { inline_keyboard: [[{ text: "🌐 Открыть Folio", url: FOLIO_URL }]] };
}

// Two persistent buttons always visible at the bottom
export function mainMenu(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📝 Новое задание" }, { text: "❓ Справка" }],
      [{ text: "📋 История" }],
    ],
    resize_keyboard: true,
  };
}

// keyboard([[["✏️ Поправить", "edit_assignment"], ["🆕 Новое", "new_assignment"]]])
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
