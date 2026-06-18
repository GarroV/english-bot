import { handleStart, handleInviteCode, handleHelp, handleNew } from "./handlers/start.ts";
import { handleRequest, handleChangeRequest } from "./handlers/request.ts";
import {
  handleWizardStep,
  handleTopicInput,
  handleVerbInput,
} from "./handlers/clarify.ts";
import {
  handleUseCached,
  handleGenerateNew,
  handleNewAssignment,
} from "./handlers/generate.ts";
import { handleEditAssignment, handleApplyEdit } from "./handlers/edit.ts";
import { handleDownloadPdf } from "./handlers/pdf_download.ts";
import { handleHistory, handleHistoryDownload } from "./handlers/history.ts";
import { handleInvite, handleUsers, handleSetup } from "./handlers/admin.ts";
import { isAllowed, getSession } from "./lib/db.ts";
import { sendMessage } from "./lib/telegram.ts";
import { timingSafeEqual } from "./lib/utils.ts";
import type { TgUpdate } from "./lib/types.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  // Verify the request actually came from Telegram before trusting its contents — query.from.id
  // is the tenancy key the Folio bridge writes by (service-role bypasses RLS). Telegram echoes the
  // secret_token registered via setWebhook in this header. Fail-closed when the secret is set;
  // fail-open with a warning when it is not, so the bot keeps working until the secret is configured.
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    const provided = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!timingSafeEqual(provided, webhookSecret)) {
      return new Response("forbidden", { status: 403 });
    }
  } else {
    console.warn(
      "TELEGRAM_WEBHOOK_SECRET is not set — webhook requests are unauthenticated and query.from.id is spoofable. Set the secret and re-register the webhook with secret_token.",
    );
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
    if (data.startsWith("wiz_")) return handleWizardStep(query);
    if (data.startsWith("hist_pdf_")) return handleHistoryDownload(query);

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

    if (text === "/start" || text.startsWith("/start ")) return handleStart(message);
    if (text === "/help" || text === "❓ Справка") return handleHelp(message);
    if (text === "/new" || text === "📝 Новое задание") return handleNew(message);
    if (text === "/history" || text === "📋 История") return handleHistory(message);
    if (text === "/invite") return handleInvite(message);
    if (text === "/users") return handleUsers(message);
    if (text === "/setup") return handleSetup(message);

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
    if (state === "WAITING_TOPIC") return handleTopicInput(message);
    if (state === "WAITING_VERB") return handleVerbInput(message);
    if (state === "EDITING") return handleApplyEdit(message);
  }
}
