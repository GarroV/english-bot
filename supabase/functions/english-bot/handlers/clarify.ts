import { answerCallbackQuery, editMessageText, sendMessage } from "../lib/telegram.ts";
import { getSession, setSession, findSimilarAssignment } from "../lib/db.ts";
import { keyboard } from "../lib/telegram.ts";
import type { TgCallbackQuery, ModuleType, ClarifyingParams, InlineKeyboard } from "../lib/types.ts";

// Human-readable module names for display
const MODULE_LABELS: Record<ModuleType, string> = {
  READING_MODULE: "Reading",
  VOCABULARY_MODULE: "Vocabulary",
  TRANSLATION_TEXTS: "Translation (тексты)",
  TRANSLATION_SENTENCES: "Translation (предложения)",
};

// Levels available for selection
const LEVELS = ["A2", "B1", "B2", "C1", "C2"];

// Build the clarification message text and keyboard reflecting current param state.
// Checkmark (✓) marks already-selected values.
// "Генерировать" button is always shown so user can proceed with defaults.
export function buildClarifyMessage(
  moduleType: ModuleType,
  params: ClarifyingParams
): { text: string; kb: InlineKeyboard } {
  const rows: [string, string][][] = [];

  // Level row
  rows.push(
    LEVELS.map((l) => [`${params.level === l ? "✓ " : ""}${l}`, `clr_level_${l}`])
  );

  // Age row
  const ageOptions: [string, string][] = [
    ["подросток", "teen"],
    ["молодой взрослый", "young_adult"],
    ["взрослый", "adult"],
  ];
  rows.push(
    ageOptions.map(([label, val]) => [
      `${params.ageGroup === val ? "✓ " : ""}${label}`,
      `clr_age_${val}`,
    ])
  );

  // Version row — only for content modules (not translation)
  if (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE") {
    const versionOptions: [string, string][] = [
      ["студенческая", "student"],
      ["с ответами", "teacher"],
    ];
    rows.push(
      versionOptions.map(([label, val]) => [
        `${params.version === val ? "✓ " : ""}${label}`,
        `clr_ver_${val}`,
      ])
    );
  }

  // Generate button — always present so user can proceed with defaults
  rows.push([["✅ Генерировать", "clr_confirm"]]);

  const levelLine = params.level ? ` · Уровень: ${params.level}` : "";
  const ageLine = params.ageGroup
    ? ` · ${ageOptions.find(([, v]) => v === params.ageGroup)?.[0] ?? ""}`
    : "";
  const text = `Тип: *${MODULE_LABELS[moduleType]}*${levelLine}${ageLine}\n\nВыбери параметры:`;

  return { text, kb: keyboard(rows) };
}

// Handle clr_level_*, clr_age_*, clr_ver_* button taps: update params and re-render message
export async function handleClarifyParam(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data; // e.g. "clr_level_B2"

  const session = await getSession(userId);
  if (!session || session.state !== "CLARIFYING") return;

  const moduleType = session.context.module_type!;
  const params: ClarifyingParams = { ...(session.context.params ?? {}) };

  if (data.startsWith("clr_level_")) {
    params.level = data.replace("clr_level_", "");
  } else if (data.startsWith("clr_age_")) {
    params.ageGroup = data.replace("clr_age_", "");
  } else if (data.startsWith("clr_ver_")) {
    params.version = data.replace("clr_ver_", "");
  }

  await setSession(userId, "CLARIFYING", { ...session.context, params });

  const { text, kb } = buildClarifyMessage(moduleType, params);
  await editMessageText(chatId, msgId, text, kb);
}

// Handle "✅ Генерировать" button: proceed to generation with current params
export async function handleClarifyConfirm(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;

  const session = await getSession(userId);
  if (!session || session.state !== "CLARIFYING") return;

  const moduleType = session.context.module_type!;
  const params: ClarifyingParams = { ...(session.context.params ?? {}) };
  const userInput = session.context.last_request ?? "";

  // Apply defaults for missing params
  if (!params.level) params.level = "B1";
  if (!params.ageGroup) params.ageGroup = "adult";
  // version only relevant for content modules — don't default for translation
  if (!params.version && (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")) {
    params.version = "student";
  }

  // Translation modules: skip cache, generate directly
  const useCache =
    moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE";

  if (useCache) {
    await editMessageText(chatId, query.message.message_id, "Ищу похожие задания...");
    const similar = await findSimilarAssignment(params.level!, userInput, params.ageGroup!);
    if (similar) {
      const preview = similar.content.slice(0, 300) + "...";
      const kb = keyboard([
        [["✅ Использовать это", "use_cached"]],
        [["🔄 Сгенерировать новое", "generate_new"]],
      ]);
      await setSession(userId, "CACHE_OFFER", {
        last_request: userInput,
        module_type: moduleType,
        params,
        cached_assignment_id: similar.id,
      });
      await editMessageText(chatId, query.message.message_id, `Нашёл похожее задание:\n\n${preview}`, kb);
      return;
    }
  }

  await sendMessage(chatId, "Генерирую задание, подожди 10–30 секунд...");
  const { generateAndSend } = await import("./generate.ts");
  try {
    await generateAndSend({ userId, chatId, userInput, moduleType, params });
  } catch (e) {
    console.error("generateAndSend failed:", e);
    await sendMessage(chatId, friendlyError(e));
  }
}

// Map API errors to user-friendly Russian messages
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
