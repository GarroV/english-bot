import { handleStart, handleInviteCode } from "./handlers/start.ts";
import { handleRequest, handleChangeRequest } from "./handlers/request.ts";
import {
  handleClarifyParam,
  handleClarifyConfirm,
} from "./handlers/clarify.ts";
import {
  handleUseCached,
  handleGenerateNew,
  handleNewAssignment,
} from "./handlers/generate.ts";
import { handleEditAssignment, handleApplyEdit } from "./handlers/edit.ts";
import { handleDownloadPdf } from "./handlers/pdf_download.ts";
import { handleInvite, handleUsers } from "./handlers/admin.ts";
import { isAllowed, getSession } from "./lib/db.ts";
import { sendMessage } from "./lib/telegram.ts";
import type { TgUpdate } from "./lib/types.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  let chatId: number | null = null;
  try {
    const update: TgUpdate = await req.json();
    chatId = update.message?.chat.id ?? update.callback_query?.message.chat.id ?? null;
    await route(update);
  } catch (e) {
    console.error("Unhandled error:", e);
    if (chatId) {
      try {
        await sendMessage(chatId, "Что-то пошло не так. Попробуй ещё раз через минуту.");
      } catch (_) { /* ignore send failure */ }
    }
  }

  return new Response("OK", { status: 200 });
});

// Route an incoming Telegram update to the correct handler
async function route(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    const query = update.callback_query;
    if (!(await isAllowed(query.from.id))) return;

    const { data } = query;

    // Parameter selection buttons in CLARIFYING state
    if (data.startsWith("clr_level_") || data.startsWith("clr_age_") || data.startsWith("clr_ver_")) {
      return handleClarifyParam(query);
    }
    if (data === "clr_confirm") return handleClarifyConfirm(query);

    if (data === "change_request") return handleChangeRequest(query);
    if (data === "use_cached") return handleUseCached(query);
    if (data === "generate_new") return handleGenerateNew(query);
    if (data === "edit_assignment") return handleEditAssignment(query);
    if (data === "download_pdf") return handleDownloadPdf(query);
    if (data === "new_assignment") return handleNewAssignment(query);
    return;
  }

  if (update.message) {
    const message = update.message;
    const text = message.text ?? "";
    const userId = message.from.id;
    const chatId = message.chat.id;

    if (text === "/start") return handleStart(message);
    if (text === "/invite") return handleInvite(message);
    if (text === "/users") return handleUsers(message);

    const session = await getSession(userId);

    if (!(await isAllowed(userId))) {
      if (session?.state === "REGISTERING") {
        return handleInviteCode(message);
      }
      await sendMessage(chatId, "Привет! Напиши /start чтобы начать.");
      return;
    }

    const state = session?.state ?? "WAITING_REQUEST";
    if (state === "WAITING_REQUEST") return handleRequest(message);
    if (state === "EDITING") return handleApplyEdit(message);
  }
}
