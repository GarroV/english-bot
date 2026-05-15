import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  keyboard,
} from "../lib/telegram.ts";
import {
  getSession,
  setSession,
  saveAssignment,
  getAssignment,
} from "../lib/db.ts";
import { generateModuleContent, generateTeacherGuide } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery, ModuleType, ClarifyingParams } from "../lib/types.ts";

// Handle "✅ Использовать это" button: display cached assignment from DB
export async function handleUseCached(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const session = await getSession(userId);
  const assignment = await getAssignment(session?.context.cached_assignment_id ?? "");

  if (!assignment) {
    await sendMessage(chatId, "Не нашёл задание. Генерирую новое...");
    const userInput = session?.context.last_request ?? "";
    const moduleType = (session?.context.module_type ?? "READING_MODULE") as ModuleType;
    const params: ClarifyingParams = session?.context.params ?? {};
    await generateAndSend({ userId, chatId, userInput, moduleType, params });
    return;
  }

  await setSession(userId, "POST_GENERATION", {
    current_assignment: assignment.content,
    module_type: session?.context.module_type,
    params: session?.context.params,
  });
  await sendAssignment(chatId, assignment.content);
}

// Handle "🔄 Сгенерировать новое" button: generate fresh, bypassing the cache
export async function handleGenerateNew(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const session = await getSession(userId);
  const userInput = session?.context.last_request ?? "";
  const moduleType = (session?.context.module_type ?? "READING_MODULE") as ModuleType;
  const params: ClarifyingParams = session?.context.params ?? {};

  await sendMessage(chatId, "Генерирую задание, подожди 10–30 секунд...");
  try {
    await generateAndSend({ userId, chatId, userInput, moduleType, params });
  } catch (e) {
    console.error("generateAndSend failed:", e);
    await sendMessage(chatId, friendlyError(e));
  }
}

// Handle "🆕 Новое задание" button: reset state and prompt for a new request
export async function handleNewAssignment(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "WAITING_REQUEST");
  await sendMessage(
    query.message.chat.id,
    "Напиши новый запрос — опиши задачу в свободной форме:\n\nНапример:\n• B2, бизнес, взрослый\n• лексика по теме путешествия, C1\n• переводные тексты по публицистике"
  );
}

// Generate content, save to cache (READING/VOCABULARY only), update session, send to chat
export async function generateAndSend(params: {
  userId: number;
  chatId: number;
  userInput: string;
  moduleType: ModuleType;
  params: ClarifyingParams;
}): Promise<void> {
  const { userId, chatId, userInput, moduleType } = params;
  const clrParams = params.params;

  const studentContent = await generateModuleContent(moduleType, clrParams, userInput);

  // Teacher guide: only for content modules, only when requested
  let teacherContent: string | undefined;
  if (
    clrParams.version === "teacher" &&
    (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")
  ) {
    teacherContent = await generateTeacherGuide(studentContent);
  }

  // Cache only READING and VOCABULARY — translation exercises are too unique
  if (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE") {
    await saveAssignment({
      telegramId: userId,
      level: clrParams.level ?? "B1",
      topic: userInput,
      ageGroup: clrParams.ageGroup ?? "adult",
      moduleType,
      requestText: userInput,
      content: studentContent,
    });
  }

  await setSession(userId, "POST_GENERATION", {
    current_assignment: studentContent,
    current_assignment_teacher: teacherContent,
    module_type: moduleType,
    params: clrParams,
  });

  await sendAssignment(chatId, studentContent, !!teacherContent);
}

// Send the assignment with action buttons
async function sendAssignment(
  chatId: number,
  text: string,
  hasTeacher = false
): Promise<void> {
  const kb = keyboard([
    [["✏️ Поправить что-то", "edit_assignment"]],
    [[hasTeacher ? "📄 Скачать PDF (студент + учитель)" : "📄 Скачать PDF", "download_pdf"]],
    [["🆕 Новое задание", "new_assignment"]],
  ]);
  const parts = splitIfLong(text);
  for (let i = 0; i < parts.length; i++) {
    if (i === parts.length - 1) {
      await sendMessage(chatId, parts[i], kb);
    } else {
      await sendMessage(chatId, parts[i]);
    }
  }
}

function friendlyError(e: unknown): string {
  const msg = String(e);
  if (msg.includes("credit balance") || msg.includes("too low")) {
    return "На счёте закончились кредиты Anthropic. Пополни баланс и попробуй снова.";
  }
  if (msg.includes("rate_limit") || msg.includes("429")) {
    return "Слишком много запросов. Подожди минуту и попробуй снова.";
  }
  if (msg.includes("401") || msg.includes("authentication")) {
    return "Ошибка авторизации API. Обратись к администратору.";
  }
  return "Что-то пошло не так. Попробуй ещё раз через минуту.";
}
