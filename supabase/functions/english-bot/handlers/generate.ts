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
  findSimilarAssignment,
  getAssignment,
} from "../lib/db.ts";
import { generateAssignment } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

// Parse comma-separated user input into level, topic, and age group fields
function parseRequest(input: string): { level: string; topic: string; ageGroup: string } {
  const parts = input.split(",").map((s) => s.trim());
  return {
    level: parts[0]?.toUpperCase() ?? "",
    topic: parts[1] ?? "",
    ageGroup: parts[2] ?? "",
  };
}

// Handle "✅ Генерировать" button: check cache first, offer cached result or generate fresh
export async function handleConfirm(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const session = await getSession(userId);
  const userInput = session?.context.last_request ?? "";

  await editMessageText(chatId, query.message.message_id, "Ищу похожие задания...");

  const { level, topic, ageGroup } = parseRequest(userInput);
  const similar = await findSimilarAssignment(level, topic, ageGroup);

  if (similar) {
    const preview = similar.content.slice(0, 300) + "...";
    const kb = keyboard([
      [["✅ Использовать это", "use_cached"]],
      [["🔄 Сгенерировать новое", "generate_new"]],
    ]);
    await setSession(userId, "CACHE_OFFER", {
      last_request: userInput,
      cached_assignment_id: similar.id,
    });
    await sendMessage(chatId, `Нашёл похожее задание:\n\n${preview}`, kb);
    return;
  }

  await sendMessage(chatId, "Генерирую задание, подожди 10–20 секунд...");
  await generateAndSend({ userId, chatId, userInput, level, topic, ageGroup });
}

// Handle "✅ Использовать это" button: load cached assignment from DB and display it
export async function handleUseCached(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const session = await getSession(userId);
  const assignment = await getAssignment(session?.context.cached_assignment_id ?? "");

  if (!assignment) {
    await sendMessage(chatId, "Не нашёл задание. Генерирую новое...");
    const userInput = session?.context.last_request ?? "";
    const { level, topic, ageGroup } = parseRequest(userInput);
    await generateAndSend({ userId, chatId, userInput, level, topic, ageGroup });
    return;
  }

  await setSession(userId, "POST_GENERATION", { current_assignment: assignment.content });
  await sendAssignment(chatId, assignment.content);
}

// Handle "🔄 Сгенерировать новое" button: generate a fresh assignment ignoring the cache
export async function handleGenerateNew(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const session = await getSession(userId);
  const userInput = session?.context.last_request ?? "";
  const { level, topic, ageGroup } = parseRequest(userInput);

  await sendMessage(chatId, "Генерирую задание, подожди 10–20 секунд...");
  await generateAndSend({ userId, chatId, userInput, level, topic, ageGroup });
}

// Generate assignment via Claude, save to cache, update session, and send to chat
async function generateAndSend(params: {
  userId: number;
  chatId: number;
  userInput: string;
  level: string;
  topic: string;
  ageGroup: string;
}): Promise<void> {
  const content = await generateAssignment(params.userInput);

  await saveAssignment({
    telegramId: params.userId,
    level: params.level,
    topic: params.topic,
    ageGroup: params.ageGroup,
    requestText: params.userInput,
    content,
  });

  await setSession(params.userId, "POST_GENERATION", { current_assignment: content });
  await sendAssignment(params.chatId, content);
}

// Send the assignment text, splitting into two messages if it exceeds the length limit
async function sendAssignment(chatId: number, text: string): Promise<void> {
  const kb = keyboard([
    [["✏️ Поправить что-то", "edit_assignment"]],
    [["📄 Скачать PDF", "download_pdf"]],
  ]);
  const [first, second] = splitIfLong(text);
  if (second !== null) {
    await sendMessage(chatId, first);
    await sendMessage(chatId, second, kb);
  } else {
    await sendMessage(chatId, first, kb);
  }
}
