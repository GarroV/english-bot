import { sendMessage, answerCallbackQuery, keyboard } from "../lib/telegram.ts";
import { setSession, logLlmUsage, getGenerationBudget } from "../lib/db.ts";
import { generateModuleContent, generateTeacherGuide, MODEL } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery, ModuleType, ClarifyingParams } from "../lib/types.ts";

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

  // Квота генераций (#75): fail-open — сбой проверки не должен класть генерацию (это мягкий
  // биллинг-контроль, как logLlmUsage), но исчерпанный лимит останавливает ДО платного вызова.
  const budget = await getGenerationBudget(userId).catch((e) => {
    console.error("quota check failed:", e);
    return null;
  });
  if (budget && budget.used >= budget.granted) {
    await setSession(userId, "WAITING_REQUEST");
    await sendMessage(
      chatId,
      `🚫 Лимит генераций исчерпан (использовано ${budget.used} из ${budget.granted}).\nПопроси администратора добавить генерации.`,
    );
    return;
  }

  const studentContent = await generateModuleContent(moduleType, clrParams, userInput,
    (u) => logLlmUsage({ source: "bot", refId: String(userId), action: "module", model: MODEL, usage: u }));

  // Teacher guide: only for content modules, only when requested
  let teacherContent: string | undefined;
  if (
    clrParams.version === "teacher" &&
    (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")
  ) {
    teacherContent = await generateTeacherGuide(studentContent,
      (u) => logLlmUsage({ source: "bot", refId: String(userId), action: "teacher_guide", model: MODEL, usage: u }));
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
