import { sendMessage, mainMenu, siteLink, keyboard, editMessageText, answerCallbackQuery } from "../lib/telegram.ts";
import {
  isAllowed,
  isDisabled,
  registerUser,
  deleteUser,
  setSession,
  validateInvite,
  useInvite,
  getInviteCreator,
  confirmFolioLogin,
} from "../lib/db.ts";
import { parseLoginPayload } from "../lib/folio_login.ts";
import { ADMIN_ID } from "../lib/config.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Follow-up message with an inline button that opens the Folio web app.
// Sent as a separate message because the persistent reply keyboard (mainMenu) and an
// inline URL button cannot share one message; the reply keyboard stays visible regardless.
async function sendSiteLink(chatId: number): Promise<void> {
  await sendMessage(chatId, "Веб-кабинет Folio 👇", siteLink());
}

const WELCOME =
  "Я генерирую учебные задания по английскому. Вот что умею:\n\n" +
  "📖 *Reading* — текст для чтения + упражнения\n" +
  "📝 *Vocabulary* — словарный список + упражнения\n" +
  "🔤 *Перевод текстов* — тексты разных жанров с русского на английский\n" +
  "✏️ *Перевод предложений* — предложения по грамматической теме\n" +
  "🔡 *Глаголы* — 20 предложений на конкретный глагол (must, can и др.)\n\n" +
  "Напиши тему задания:";

const HELP =
  "*Как пользоваться ботом*\n\n" +
  "Бот генерирует готовые учебные задания по английскому. Напиши тему — получишь файл PDF, который можно сразу распечатать.\n\n" +

  "─────────────────────\n" +
  "*Типы заданий*\n\n" +

  "📖 *Reading*\n" +
  "Текст для чтения на английском + набор упражнений к нему: вопросы на понимание, True/False, тест с вариантами ответов, вставь слово, исправь ошибку и другие. Подходит для полноценного урока.\n\n" +

  "📝 *Vocabulary*\n" +
  "Словарный список по теме + упражнения на отработку слов. Без текста для чтения — только лексика. Удобно, когда нужно погонять новые слова.\n\n" +

  "🔤 *Перевод (тексты)*\n" +
  "4–5 коротких текстов на русском разных жанров (публицистика, официальный стиль, аналитика и др.) — студент переводит их на английский. Отличная тренировка письменного перевода.\n\n" +

  "✏️ *Перевод (предложения)*\n" +
  "Блоки изолированных предложений на русском по одной грамматической теме. Студент переводит каждое предложение. Хорошо для отработки конкретной грамматики.\n\n" +

  "🔡 *Глаголы (предложения)*\n" +
  "20 предложений на русском, каждое из которых нужно перевести, используя конкретный глагол или пару глаголов (например: must / have to, can / could). Бот спросит, какой глагол использовать.\n\n" +

  "─────────────────────\n" +
  "*Как создать задание*\n\n" +
  "1. Нажми *📝 Новое задание* или напиши тему в чат\n" +
  "2. Выбери тип задания\n" +
  "3. Выбери уровень (A2 / B1 / B2 / C1 / C2)\n" +
  "4. Выбери аудиторию (подросток / молодой взрослый / взрослый)\n" +
  "5. Для Reading и Vocabulary — выбери версию (без ответов или с ответами для учителя)\n\n" +
  "Бот сгенерирует задание за 10–30 секунд.\n\n" +

  "─────────────────────\n" +
  "*Что делать после генерации*\n\n" +
  "✏️ *Поправить что-то* — опиши, что изменить, и бот переделает нужную часть\n" +
  "📄 *Скачать PDF* — получишь готовый файл для печати\n" +
  "🆕 *Новое задание* — начать сначала\n\n" +

  "─────────────────────\n" +
  "*Примеры тем*\n" +
  "• B2, бизнес, взрослый\n" +
  "• лексика по теме путешествия, C1\n" +
  "• переводные предложения, условные предложения, B2\n" +
  "• задание на глаголы must и have to, B1\n" +
  "• финальный урок, Animal Farm, B1, подросток";

// Handle the /start command — registers admin, resets state for existing users,
// or prompts new users for an invite code
export async function handleStart(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;

  // Folio web login: "/start folio_login_<token>". Do NOT auto-confirm — a deep-link someone else
  // generated, tapped by this user, would silently authorize THEIR browser into this account
  // (login-CSRF, #4). Require an explicit, informed confirmation via inline buttons instead.
  const loginToken = parseLoginPayload(message.text ?? "");
  if (loginToken) {
    const kb = keyboard([[
      ["✅ Подтвердить вход", `folio_confirm_${loginToken}`],
      ["❌ Отмена", `folio_cancel_${loginToken}`],
    ]]);
    await sendMessage(
      chatId,
      "🔐 Запрос на вход в *Folio*.\n\n" +
        "Если *вы сами* только что открыли вход на сайте — нажмите «Подтвердить вход».\n" +
        "Если вы этого не делали — нажмите «Отмена», ничего не произойдёт.",
      kb,
    );
    return;
  }

  // Admin bypasses invite requirement
  if (id === ADMIN_ID) {
    await registerUser(id, username, first_name);
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, `Добро пожаловать! ${WELCOME}`, mainMenu());
    await sendSiteLink(chatId);
    return;
  }

  // Soft-revoked user (row exists, disabled_at set): show the revoke message and STOP — never funnel
  // them into re-registration. Re-activation is admin-only via /restore, not self-service by invite.
  if (await isDisabled(id)) {
    await sendMessage(chatId, "Ваш доступ отозван. Обратитесь к администратору.");
    return;
  }

  // Already registered
  if (await isAllowed(id)) {
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, WELCOME, mainMenu());
    await sendSiteLink(chatId);
    return;
  }

  // New user — request invite code
  await setSession(id, "REGISTERING");
  await sendMessage(chatId, "Привет! Для доступа введи инвайт-код:");
}

// Handle /help command — send usage guide
export async function handleHelp(message: TgMessage): Promise<void> {
  await sendMessage(message.chat.id, HELP, mainMenu());
  await sendSiteLink(message.chat.id);
}

// Handle /new command — shortcut to reset state and start a new assignment
export async function handleNew(message: TgMessage): Promise<void> {
  if (!(await isAllowed(message.from.id))) return;
  await setSession(message.from.id, "WAITING_REQUEST");
  await sendMessage(message.chat.id, WELCOME, mainMenu());
}

// Handle invite code submission — validates the code, registers the user, and grants access
export async function handleInviteCode(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;
  const code = message.text?.trim().toUpperCase() ?? "";

  if (!(await validateInvite(code))) {
    await sendMessage(chatId, "Неверный или уже использованный код. Попробуй ещё раз:");
    return;
  }

  // Register first: eb_invitations.used_by has an FK to eb_users(telegram_id), so the atomic claim
  // below can only set used_by once the user row exists. The claim (.is('used_by', null)) then
  // prevents one code from registering several users.
  const invitedBy = await getInviteCreator(code);
  await registerUser(id, username, first_name, invitedBy ?? undefined);

  const claimed = await useInvite(code, id);
  if (!claimed) {
    // Rare race: the code was claimed by someone else between validate and claim. Roll back the
    // just-created registration so access stays tied to a genuinely consumed code.
    await deleteUser(id);
    await sendMessage(chatId, "Этот код только что использовали. Попробуй другой:");
    return;
  }

  await setSession(id, "WAITING_REQUEST");
  await sendMessage(chatId, `Доступ открыт! ${WELCOME}`, mainMenu());
}

// Map a confirmFolioLogin outcome to a user-facing reply.
function folioLoginReply(result: Awaited<ReturnType<typeof confirmFolioLogin>>): string {
  return result === "confirmed"
    ? "✅ Вход в Folio подтверждён. Вернись на сайт."
    : result === "disabled"
      ? "Ваш доступ к Folio отозван. Обратитесь к администратору."
      : result === "invite_expired"
        ? "Приглашение истекло или уже использовано. Запроси новую ссылку."
        : result === "not_linked"
          ? "Этот Telegram не привязан к Folio."
          : "Ссылка устарела. Открой вход в Folio заново.";
}

// Explicit confirmation of a Folio web login (#4). Reachable by any Telegram user — Folio users need
// not be on the english-bot allowlist — so index.ts routes it BEFORE the isAllowed gate.
export async function handleFolioConfirm(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  const token = query.data.slice("folio_confirm_".length);
  const { id, first_name, username } = query.from;
  const result = await confirmFolioLogin(token, id, first_name, username);
  await editMessageText(query.message.chat.id, query.message.message_id, folioLoginReply(result));
}

// Decline a Folio web login request — nothing is confirmed.
export async function handleFolioCancel(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Отменено");
  await editMessageText(
    query.message.chat.id,
    query.message.message_id,
    "Вход отменён. Если это были не вы — всё в порядке, ничего не произошло.",
  );
}
