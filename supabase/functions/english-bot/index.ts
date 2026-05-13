import { handleStart, handleInviteCode } from "./handlers/start.ts";
import { handleRequest, handleChangeRequest } from "./handlers/request.ts";
import {
  handleConfirm,
  handleUseCached,
  handleGenerateNew,
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

  try {
    const update: TgUpdate = await req.json();
    await route(update);
  } catch (e) {
    console.error("Unhandled error:", e);
  }

  // Always return 200 so Telegram does not retry
  return new Response("OK", { status: 200 });
});

// Route an incoming Telegram update to the correct handler
async function route(update: TgUpdate): Promise<void> {
  // Callback query routing (inline button taps)
  if (update.callback_query) {
    const query = update.callback_query;
    if (!(await isAllowed(query.from.id))) return;

    const { data } = query;
    if (data === "confirm") return handleConfirm(query);
    if (data === "change_request") return handleChangeRequest(query);
    if (data === "use_cached") return handleUseCached(query);
    if (data === "generate_new") return handleGenerateNew(query);
    if (data === "edit_assignment") return handleEditAssignment(query);
    if (data === "download_pdf") return handleDownloadPdf(query);
    return;
  }

  // Message routing
  if (update.message) {
    const message = update.message;
    const text = message.text ?? "";
    const userId = message.from.id;
    const chatId = message.chat.id;

    // Commands — always handled regardless of state
    if (text === "/start") return handleStart(message);
    if (text === "/invite") return handleInvite(message);
    if (text === "/users") return handleUsers(message);

    // Non-command: get session to determine routing
    const session = await getSession(userId);

    // Unregistered user
    if (!(await isAllowed(userId))) {
      if (session?.state === "REGISTERING") {
        return handleInviteCode(message);
      }
      await sendMessage(chatId, "Привет! Напиши /start чтобы начать.");
      return;
    }

    // Registered user: route by state
    const state = session?.state ?? "WAITING_REQUEST";
    if (state === "WAITING_REQUEST") return handleRequest(message);
    if (state === "EDITING") return handleApplyEdit(message);
  }
}
