import { sendMessage } from "../lib/telegram.ts";
import {
  isAllowed,
  registerUser,
  setSession,
  validateInvite,
  useInvite,
  getInviteCreator,
} from "../lib/db.ts";
import type { TgMessage } from "../lib/types.ts";

const ADMIN_ID = Number(Deno.env.get("ADMIN_USER_ID")!);

const WELCOME =
  "Напиши запрос в свободной форме — и я сделаю готовый учебный материал.\n\n" +
  "Примеры:\n" +
  "• B2, бизнес, взрослый\n" +
  "• лексика по теме путешествия, C1\n" +
  "• переводные тексты по публицистике, B2\n" +
  "• переводные предложения, модальные глаголы, C1\n\n" +
  "Бот сам определит тип задания и уточнит параметры.";

const HELP =
  "*Как пользоваться ботом*\n\n" +
  "*Типы заданий:*\n" +
  "• *Reading* — текст + упражнения (True/False, MCQ, Gap fill и др.)\n" +
  "• *Vocabulary* — словарный список + упражнения без текста\n" +
  "• *Translation (тексты)* — 4–5 связных текстов с русского на английский\n" +
  "• *Translation (предложения)* — блоки предложений по грамматической теме\n\n" +
  "*Как задать запрос:*\n" +
  "Пиши в свободной форме. Уровень, тема, возраст — всё что знаешь.\n\n" +
  "Примеры:\n" +
  "• B2, бизнес, взрослый\n" +
  "• лексика по теме путешествия, C1\n" +
  "• переводные предложения, модальные глаголы, C1\n" +
  "• финальный урок, Animal Farm, B1, подросток\n\n" +
  "*Версия с ответами:*\n" +
  "Для Reading и Vocabulary можно выбрать «с ответами» — получишь два PDF: студенческий и учительский.\n\n" +
  "*/new* — начать новое задание\n" +
  "*/help* — эта справка";

// Handle the /start command — registers admin, resets state for existing users,
// or prompts new users for an invite code
export async function handleStart(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;

  // Admin bypasses invite requirement
  if (id === ADMIN_ID) {
    await registerUser(id, username, first_name);
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, `Добро пожаловать! ${WELCOME}`);
    return;
  }

  // Already registered
  if (await isAllowed(id)) {
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, WELCOME);
    return;
  }

  // New user — request invite code
  await setSession(id, "REGISTERING");
  await sendMessage(chatId, "Привет! Для доступа введи инвайт-код:");
}

// Handle /help command — send usage guide
export async function handleHelp(message: TgMessage): Promise<void> {
  await sendMessage(message.chat.id, HELP);
}

// Handle /new command — shortcut to reset state and start a new assignment
export async function handleNew(message: TgMessage): Promise<void> {
  if (!(await isAllowed(message.from.id))) return;
  await setSession(message.from.id, "WAITING_REQUEST");
  await sendMessage(message.chat.id, WELCOME);
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

  const invitedBy = await getInviteCreator(code);
  await registerUser(id, username, first_name, invitedBy ?? undefined);
  await useInvite(code, id);
  await setSession(id, "WAITING_REQUEST");
  await sendMessage(chatId, `Доступ открыт! ${WELCOME}`);
}
