import { sendMessage, mainMenu } from "../lib/telegram.ts";
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

  // Admin bypasses invite requirement
  if (id === ADMIN_ID) {
    await registerUser(id, username, first_name);
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, `Добро пожаловать! ${WELCOME}`, mainMenu());
    return;
  }

  // Already registered
  if (await isAllowed(id)) {
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, WELCOME, mainMenu());
    return;
  }

  // New user — request invite code
  await setSession(id, "REGISTERING");
  await sendMessage(chatId, "Привет! Для доступа введи инвайт-код:");
}

// Handle /help command — send usage guide
export async function handleHelp(message: TgMessage): Promise<void> {
  await sendMessage(message.chat.id, HELP, mainMenu());
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

  const invitedBy = await getInviteCreator(code);
  await registerUser(id, username, first_name, invitedBy ?? undefined);
  await useInvite(code, id);
  await setSession(id, "WAITING_REQUEST");
  await sendMessage(chatId, `Доступ открыт! ${WELCOME}`, mainMenu());
}
