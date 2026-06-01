import { answerCallbackQuery, editMessageText, sendMessage, keyboard } from "../lib/telegram.ts";
import { getSession, setSession } from "../lib/db.ts";
import type { TgCallbackQuery, TgMessage, ModuleType, ClarifyingParams, InlineKeyboard } from "../lib/types.ts";

// Human-readable module names for display
const MODULE_LABELS: Record<ModuleType, string> = {
  READING_MODULE: "Reading",
  VOCABULARY_MODULE: "Vocabulary",
  TRANSLATION_TEXTS: "Translation (тексты)",
  TRANSLATION_SENTENCES: "Перевод (предложения)",
  VERB_SENTENCES: "Глаголы (предложения)",
};

// Build a single wizard step keyboard and summary text.
// Each step renders only the choices relevant to that step.
export function buildWizardMessage(
  step: "type" | "version" | "level" | "age",
  moduleType: ModuleType,
  params: ClarifyingParams
): { text: string; kb: InlineKeyboard } {
  if (step === "type") {
    const mark = (t: ModuleType) => moduleType === t ? "✓ " : "";
    const rows: [string, string][][] = [
      [
        [`${mark("READING_MODULE")}Reading`, "wiz_type_READING_MODULE"],
        [`${mark("VOCABULARY_MODULE")}Vocabulary`, "wiz_type_VOCABULARY_MODULE"],
      ],
      [
        [`${mark("TRANSLATION_TEXTS")}Перевод (тексты)`, "wiz_type_TRANSLATION_TEXTS"],
        [`${mark("TRANSLATION_SENTENCES")}Перевод (пред.)`, "wiz_type_TRANSLATION_SENTENCES"],
      ],
      [
        [`${mark("VERB_SENTENCES")}Глаголы (пред.)`, "wiz_type_VERB_SENTENCES"],
      ],
    ];
    return { text: "Выбери тип задания:", kb: keyboard(rows) };
  }

  const typeLabel = MODULE_LABELS[moduleType];

  if (step === "version") {
    const rows: [string, string][][] = [[
      [`${params.version === "student" ? "✓ " : ""}Без ответов`, "wiz_ver_student"],
      [`${params.version === "teacher" ? "✓ " : ""}С ответами для учителя`, "wiz_ver_teacher"],
    ]];
    return { text: `✓ ${typeLabel}\n\nВерсия:`, kb: keyboard(rows) };
  }

  const verLabel = params.version === "student"
    ? " · Без ответов"
    : params.version === "teacher"
    ? " · С ответами для учителя"
    : "";

  if (step === "level") {
    const rows: [string, string][][] = [[
      ...["A2", "B1", "B2", "C1", "C2"].map((l): [string, string] => [
        `${params.level === l ? "✓ " : ""}${l}`,
        `wiz_level_${l}`,
      ]),
    ]];
    return { text: `✓ ${typeLabel}${verLabel}\n\nУровень:`, kb: keyboard(rows) };
  }

  // step === "age"
  const lvlLabel = params.level ? ` · ${params.level}` : "";
  const ageOptions: [string, string][] = [
    ["подросток", "teen"],
    ["молодой взрослый", "young_adult"],
    ["взрослый", "adult"],
  ];
  const rows: [string, string][][] = [[
    ...ageOptions.map(([lbl, val]): [string, string] => [
      `${params.ageGroup === val ? "✓ " : ""}${lbl}`,
      `wiz_age_${val}`,
    ]),
  ]];
  return { text: `✓ ${typeLabel}${verLabel}${lvlLabel}\n\nНаправленность:`, kb: keyboard(rows) };
}

// Handle all wiz_* callback taps and advance the wizard one step at a time.
// On the final step (age), fires generation immediately — no confirm button.
export async function handleWizardStep(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);

  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  const session = await getSession(userId);
  if (!session || session.state !== "CLARIFYING") return;

  const params: ClarifyingParams = { ...(session.context.params ?? {}) };
  let moduleType = (session.context.module_type ?? "READING_MODULE") as ModuleType;

  if (data.startsWith("wiz_type_")) {
    moduleType = data.replace("wiz_type_", "") as ModuleType;
    delete params.version;
    delete params.targetVerb;
    const nextStep = (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")
      ? "version" as const
      : "level" as const;
    await setSession(userId, "CLARIFYING", { ...session.context, module_type: moduleType, params, wizard_step: nextStep });
    const { text, kb } = buildWizardMessage(nextStep, moduleType, params);
    await editMessageText(chatId, msgId, text, kb);
    return;
  }

  if (data.startsWith("wiz_ver_")) {
    params.version = data.replace("wiz_ver_", "");
    await setSession(userId, "CLARIFYING", { ...session.context, module_type: moduleType, params, wizard_step: "level" });
    const { text, kb } = buildWizardMessage("level", moduleType, params);
    await editMessageText(chatId, msgId, text, kb);
    return;
  }

  if (data.startsWith("wiz_level_")) {
    params.level = data.replace("wiz_level_", "");
    await setSession(userId, "CLARIFYING", { ...session.context, module_type: moduleType, params, wizard_step: "age" });
    const { text, kb } = buildWizardMessage("age", moduleType, params);
    await editMessageText(chatId, msgId, text, kb);
    return;
  }

  if (data.startsWith("wiz_age_")) {
    params.ageGroup = data.replace("wiz_age_", "");
    if (!params.level) params.level = "B1";
    if (!params.version && (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")) {
      params.version = "student";
    }
    const userInput = session.context.last_request ?? "";

    if (moduleType === "VERB_SENTENCES" && !params.targetVerb) {
      await setSession(userId, "WAITING_VERB", { ...session.context, module_type: moduleType, params });
      await editMessageText(chatId, msgId, "Какой глагол? (например: must / have to)");
      return;
    }

    await editMessageText(chatId, msgId, "Генерирую задание, подожди 10–30 секунд...");
    const { generateAndSend } = await import("./generate.ts");
    try {
      await generateAndSend({ userId, chatId, userInput, moduleType, params });
    } catch (e) {
      console.error("handleWizardStep failed:", e);
      await sendMessage(chatId, friendlyError(e));
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

// Handle topic input in WAITING_TOPIC state: generate with stored params
export async function handleTopicInput(message: TgMessage): Promise<void> {
  const topic = message.text?.trim() ?? "";
  const userId = message.from.id;
  const chatId = message.chat.id;

  const session = await getSession(userId);
  if (!session) return;

  const moduleType = (session.context.module_type ?? "READING_MODULE") as ModuleType;
  const params: ClarifyingParams = session.context.params ?? {};

  await sendMessage(chatId, "Генерирую задание, подожди 10–30 секунд...");
  const { generateAndSend } = await import("./generate.ts");
  try {
    await generateAndSend({ userId, chatId, userInput: topic, moduleType, params });
  } catch (e) {
    console.error("generateAndSend failed:", e);
    await sendMessage(chatId, friendlyError(e));
  }
}

// Handle verb input in WAITING_VERB state: save verb to params and generate
export async function handleVerbInput(message: TgMessage): Promise<void> {
  const verb = message.text?.trim() ?? "";
  const userId = message.from.id;
  const chatId = message.chat.id;

  const session = await getSession(userId);
  if (!session) return;

  const moduleType = (session.context.module_type ?? "VERB_SENTENCES") as ModuleType;
  const params: ClarifyingParams = { ...(session.context.params ?? {}), targetVerb: verb };
  const userInput = session.context.last_request ?? "";

  await sendMessage(chatId, "Генерирую задание, подожди 10–30 секунд...");
  const { generateAndSend } = await import("./generate.ts");
  try {
    await generateAndSend({ userId, chatId, userInput, moduleType, params });
  } catch (e) {
    console.error("generateAndSend failed:", e);
    await sendMessage(chatId, friendlyError(e));
  }
}
