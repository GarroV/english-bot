import Anthropic from "npm:@anthropic-ai/sdk";
import type {
  ModuleType,
  ClarifyingParams,
  LlmUsage,
  HomeworkItem,
  HomeworkItemType,
} from "../english-bot/lib/types.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_KEY") });

// Current Anthropic model — single source of truth (was claude-sonnet-4-20250514, which
// the API retired with a 404 not_found_error, breaking generation in both bot and web).
export const MODEL = "claude-sonnet-4-6";

// ─── Prompts ──────────────────────────────────────────────────────────────────

// CEFR level descriptors injected into prompts as {LEVEL_DESC} — the model otherwise has only
// the bare level code and drifts (audit 2026-07-07: A2-grade errors inside a C1 error-correction task).
const LEVEL_GUIDE: Record<string, string> = {
  A2: "лексика — самые частотные ~1500 слов и элементарные фразовые глаголы; грамматика — Present/Past Simple, Present Continuous, be going to, can/must; предложения короткие (8-12 слов), без сложных придаточных",
  B1: "частотная лексика, базовые фразовые глаголы и коллокации; грамматика — все основные времена, first/second conditional, простой пассив; предложения средней длины, несложные придаточные",
  B2: "расширенная лексика, устойчивые коллокации и фразовые глаголы; грамматика — perfect-формы, все conditionals, пассив, косвенная речь; естественные сложноподчинённые конструкции",
  C1: "низкочастотная лексика, идиомы, синонимическое разнообразие; грамматика — инверсия, cleft sentences, смешанные conditionals, нюансы модальности; академический/публицистический стиль",
  C2: "весь спектр языка: тонкие регистровые различия, метафоры, редкие идиомы; грамматика без ограничений, включая книжные структуры",
};

const READING_PROMPT = `Ты опытный преподаватель английского языка. Создай Reading Module.

Запрос: {INPUT}
Уровень: {LEVEL}
Возраст: {AGE}

Ориентир уровня {LEVEL} — соблюдай его и в тексте, и в каждом задании: {LEVEL_DESC}

Структура:
1. Первая строка (до основного текста): Module: Reading · Level: {LEVEL} · Topic: [тема на английском] · Age: {AGE}
2. Авторский текст на английском
   - A2/B1: 150-200 слов, простые предложения, базовая лексика
   - B2/C1/C2: 200-300 слов, аналитика, реальные факты, без общих фраз
   - Нейтральный стиль — никаких имён героев, никакого "I travelled" / "My trip"
   - Если тема допускает мнения «за/против» — построй текст как дебат: вводный абзац с вопросом, затем аргументы обеих сторон (2-3 на сторону, с фактами и цифрами), авторскую позицию не выражай
3. Vocabulary — 10-12 единиц: фразовые глаголы и/или коллокации, которые РЕАЛЬНО встречаются в тексте выше (проверь каждую — единица должна присутствовать в пассаже дословно; не добавляй лексику, которой в тексте нет)
   - Определение простым английским (проще уровня текста); где помогает — короткий бытовой пример: "to release — to set free, like releasing a bird from a cage"
   - Только цельные лексические единицы (слово / фразовый глагол / коллокация), без словарного наполнителя вроде "more than usual"
4. Задания (Task 1 … Task N). Нумерация СКВОЗНАЯ без пропусков: если задание не входит в уровень, его номер получает следующее задание. Под заголовком каждого Task — одна строка-инструкция ученику на английском (например: "Choose the correct option.").
   Порядок заданий:
   - True/False/NS — 6 утверждений
     Формат каждого: утверждение, ниже "Ответ (T / F / NS): ___" и "Обоснование: ______"
     A2: только T/F, без NS
   - Comprehension — 5 вопросов, ответить полными предложениями
   - MCQ — 4 вопроса с вариантами A/B/C/D
   - Gap fill — 6-8 предложений с пропусками (слова из текста, не подписывать список слов)
   - Word formation — 6 предложений (только B2+; пропустить для A2/B1)
     В скобках — однокоренное слово ДРУГОЙ части речи/формы, чем нужный ответ (реальное преобразование: PROVOKE→provocative, NATION→national); ответ НЕ должен совпадать с подсказкой
   - Matching — таблица с двумя столбцами:
     Левый столбец: пронумерованные фразы/слова
     Правый столбец: буквенные определения/переводы (перемешаны)
     Формат: "1. phrase    a. meaning" — по одной паре на строку, выровнены пробелами
   - Error correction — 6 предложений с одной ошибкой каждое (только B2+; пропустить для A2/B1)
     Ошибки по уровню: для B2+ — времена, предлоги, коллокации, словообразование; НЕ элементарное согласование подлежащего и сказуемого
     Каждое предложение — ЗАКОНЧЕННОЕ, с РОВНО одной однозначной ошибкой (не обрывай предложения; не делай так, чтобы правкой могли быть два разных слова)
   - Key word transformation — 5 предложений (только C1/C2; пропустить для A2-B2)
   - Agree or disagree — 3-4 мнения вымышленных людей о теме
     Формат каждого: Имя, возраст (роль, если уместна): "мнение от первого лица, 2-3 предложения, разговорный стиль, с личным примером"
     Мнения покрывают спектр: за / против / смешанное
     Инструкция ученику: "Agree or disagree with each opinion. Explain why."
5. Discussion questions — 4-5 вопросов
   - Всегда с личным углом: Have you ever...? Would you rather...?
   - Каждый закрытый (yes/no) вопрос — с добивкой: Why? / Give an example / If so, what...?
   - Используй 4-6 единиц из Vocabulary в формулировках вопросов
   - По желанию 1-2 вопроса можно привязать к жизни ученика (Россия) — но естественно, не притягивая страну туда, где тема этого не требует
   - C1/C2: провокационные тезисы, моральные дилеммы
   - A2/B1: конкретные, простые, один-два слова в ответе достаточно

Если запрос — грамматическая тема (например: Past Continuous, Conditionals, Passive Voice):
- Тема текста — живая жизненная (Topic: реальная тема на английском, не название грамматики), но текст насыщен целевой конструкцией (10+ употреблений)
- Gap fill целится в целевую конструкцию: пропущена форма глагола, в скобках после предложения дан инфинитив
- После Gap fill добавь задание Grammar practice — 8 предложений с выбором правильной формы из двух (целевая конструкция против контрастной, например Past Continuous vs Past Simple)
- Error correction (если есть по уровню): все ошибки — в целевой конструкции

Форматирование (строго):
- Matching — ТОЛЬКО таблицей, не списком, не нумерованным списком
- True/False — короткие места: "Ответ (T / F / NS): ___" и "Обоснование: ______"
- Места под ответ — короткий прочерк из 4-6 подчёркиваний (например ______), НИКОГДА не линия во всю строку
- НЕ экранируй символы обратным слэшем: пиши _ * # как есть, без \\ перед ними
- Начинай сразу с первой строки "Module: Reading · …": без разделителя --- и без преамбулы сверху
- Пункты внутри каждого задания нумеруй: 1., 2., …
- Никаких ответов в задании
- Никаких bullet points и headers внутри упражнений
- Никаких подсказок в скобках без явного запроса (исключение — инфинитив в Gap fill грамматического режима)
- Заголовки блоков: Task 1 · True/False, Task 2 · Comprehension, и т.д.
- Никаких разделителей --- между блоками
- Никаких "Homework Assignment", "Good luck" и т.п.`;

const VOCABULARY_PROMPT = `Ты опытный преподаватель английского языка. Создай Vocabulary Module.

Запрос: {INPUT}
Уровень: {LEVEL}
Возраст: {AGE}

Ориентир уровня {LEVEL} — соблюдай его в словнике и в каждом задании: {LEVEL_DESC}

Структура (нумерация Task СКВОЗНАЯ без пропусков; под каждым Task — строка-инструкция ученику на английском):
1. Первая строка: Module: Vocabulary · Level: {LEVEL} · Topic: [тема на английском] · Age: {AGE}
2. Vocabulary List — 15-18 единиц с определениями (без текста для чтения)
   Лексика должна быть богатой и тематической ПОД УРОВЕНЬ: для B2+ — идиоматичные коллокации, фразовые глаголы и термины темы (например для темы собеседований: to be headhunted, transferable skills, salary expectations, probation period), а не общие слова (candidate, nervous, experience)
   Формат: слово/фраза — краткое определение на английском (проще уровня словника); где помогает — короткий бытовой пример
3. Matching — таблица два столбца (слово → определение/перевод)
   Формат: "1. phrase    a. meaning" — по одной паре на строку
4. MCQ — 6 предложений, выбор правильного слова из A/B/C/D
5. Gap fill — 8 предложений, вставить слово из Vocabulary List
6. Word formation — 6 предложений (только B2+; пропустить для A2/B1); в скобках — однокоренное слово ДРУГОЙ формы, ответ НЕ совпадает с подсказкой (реальное преобразование)
7. Collocations — 8 предложений с пропуском на ТЕМАТИЧЕСКИЕ коллокации (сочетаемость слов из словника с их естественными партнёрами); в скобках — два варианта, где верен ровно один
   Формат каждого: "1. Before the meeting she had to ______ her CV. (update / renew)" — ученику ясно, что выбрать и вписать
   ЗАПРЕЩЕНО: делексические глаголы make/do/give/take как предмет выбора (это не тематическая коллокация); несуществующие слова и орфографические ловушки (типа "high light" вместо "highlight"). Оба варианта — реальные слова уровня, различаются именно сочетаемостью с темой
   Не дублируй предложения и целевые слова с заданием Error correction
8. Error correction — 6 предложений с ошибкой в лексике/коллокации (только B2+; пропустить для A2/B1)
   Каждое предложение — законченное, с ровно одной однозначной ошибкой
9. Key word transformation — 5 предложений (только C1/C2; пропустить для A2-B2)
10. Discussion questions — 4-5 вопросов с личным углом (те же правила, что для Reading Module: yes/no с добивкой Why?, 4-6 слов из словника в вопросах, 1-2 вопроса про жизнь в России)

Форматирование — те же правила, что для Reading Module.`;

const TRANSLATION_TEXTS_PROMPT = `Ты опытный преподаватель английского языка. Создай Translation Module (тексты).

Запрос: {INPUT}
Уровень: {LEVEL}

Ориентир уровня {LEVEL} (целевой английский перевода должен требовать именно этих средств): {LEVEL_DESC}

Структура:
1. Первая строка: Module: Translation (Texts) · Level: {LEVEL} · Topic: [тема]
2. Четыре-пять связных текстов на русском языке для перевода на английский.
   Каждый текст — в отдельном жанровом блоке.

   Жанры (выбери 4-5 из следующих, подходящих к теме):
   - Аналитика (разбор явления, причинно-следственные связи)
   - Статистика и факты (числа, тренды, сравнения)
   - Публицистика (журнальная колонка, оценочные суждения)
   - Официальный стиль (пресс-релиз, регуляторный документ)
   - Непереводимое (русские реалии, культурные концепты, идиомы)

   Каждый блок:
   - Заголовок: название жанра (только название, без инструкций)
   - Текст: 80-120 слов, аутентичный стиль жанра

   C1/C2: Epistemic modality, ambiguity, архаика, инверсия, юридический язык.

Правила (строго):
- Никаких инструкций кроме названия жанра
- Никаких ответов, никакого перевода
- Никаких подсказок в скобках
- Никаких разделителей ---`;

const TRANSLATION_SENTENCES_PROMPT = `Ты опытный преподаватель английского языка. Создай Translation Module (предложения).

Запрос: {INPUT}
Уровень: {LEVEL}

Ориентир уровня {LEVEL} (русские предложения по сложности перевода должны попадать в этот диапазон): {LEVEL_DESC}

Структура:
1. Первая строка: Module: Translation (Sentences) · Level: {LEVEL} · Topic: [грамматическая тема]
2. Три-четыре блока предложений для перевода с русского на английский.
   Если запрос — конкретная грамматическая тема (например Past Continuous): КАЖДОЕ русское предложение во всех блоках должно ЕСТЕСТВЕННО и однозначно переводиться этой конструкцией; блоки — разные её употребления (для Past Continuous: действие в конкретный момент прошлого «в 7 вечера я…» / прерванное действие с when-clause / два параллельных действия с while / фон повествования). Не подмешивай блоки на другую грамматику.
   Проверяй КАЖДОЕ предложение: оно должно ТРЕБОВАТЬ целевую конструкцию, а не просто допускать её. Избегай предложений, которые естественнее звучат в другом времени. Для Past Continuous, в частности: не используй стативные глаголы (want, know, like, hope, understand — они не образуют прогрессив), не используй конструкции «собирался / был готов» (be going to / be about to — это намерение, а не длящееся действие), не давай контексты «весь день / целый час», тяготеющие к Past Simple.
   Иначе — каждый блок посвящён одному грамматическому явлению или подтеме.

   Каждый блок:
   - Заголовок: название явления (только название, без объяснений)
   - 8-12 пронумерованных предложений на русском
   - Предложения постепенно усложняются внутри блока

   C1/C2: Epistemic modality, conditional types mixing, subjunctive, inversion, cleft sentences.

Правила (строго):
- Только название блока — никаких объяснений, подсказок, скобок
- Никаких ответов
- Никаких разделителей ---`;

const VERB_SENTENCES_PROMPT = `Ты опытный преподаватель английского языка. Создай упражнение на перевод предложений.

Запрос: {INPUT}
Глагол(ы): {VERB}
Уровень: {LEVEL}

Ориентир уровня {LEVEL} (сложность русских предложений и требуемого английского перевода): {LEVEL_DESC}

Структура:
1. Первая строка: Module: Verb Sentences · Level: {LEVEL} · Verb: {VERB}
2. Заголовок: Переведите, используя {VERB}
3. 20 пронумерованных предложений на русском языке

Требования к предложениям:
- Каждое предложение требует использования указанного глагола
- Охватывают разные значения и контексты (возможность, разрешение, обязательность и т.д.)
- Постепенно усложняются от 1 к 20
- Уровень лексики и синтаксиса соответствует {LEVEL}

Правила (строго):
- Только русские предложения — никаких переводов, никаких ответов
- Никаких подсказок в скобках
- Никаких объяснений грамматики
- Никаких разделителей ---`;

const TEACHER_GUIDE_PROMPT = `Вот студенческое задание по английскому:

{STUDENT_CONTENT}

Создай Teacher's Guide для этого задания.

Структура:
1. Первая строка: Teacher's Guide · [скопируй первую строку из задания]
2. Overview — 2-3 предложения: о чём задание, на что обратить внимание
3. Answer Key — ответы ко всем упражнениям в том же порядке, что в задании:
   - True/False: каждое утверждение → T/F/NS + одно предложение-объяснение из текста
   - Comprehension: полные ответы
   - MCQ: буква
   - Gap fill: слово для каждого пропуска
   - Grammar practice: правильная форма для каждого предложения
   - Word formation: правильная форма
   - Matching: номер → буква
   - Error correction: исправленная версия (только исправление, без объяснения)
   - Key word transformation: правильный вариант
   - Collocations: правильное слово для каждого предложения
   - Agree or disagree / Discussion: НЕ выдумывать ответ — это вопросы на мнение. Ставить прочерк с пометкой: "— (вопрос на мнение, готового ответа нет)"
4. Discussion notes — для каждого вопроса: 1-2 предложения о возможных направлениях разговора

ВАЖНО про честность ключей: если на вопрос нет однозначного ответа в тексте (мнение, открытый вопрос, «позиция автора» там, где автор её не выразил) — не сочиняй правдоподобный ответ. Ставь "— (ответа в тексте нет / вопрос на мнение)". Выдуманный ключ хуже отсутствующего.

Форматирование:
- Короткие, чёткие ответы — никаких лишних объяснений
- Заголовки идентичны студенческой версии`;

const ITEMIZE_PROMPT = `Вот текст домашнего задания по английскому языку:

{CONTENT}

Разбери его на отдельные ВОПРОСЫ (задания, на которые ученик даёт ответ).

Верни СТРОГО JSON-массив объектов, без пояснений, без markdown-обёртки, без текста до или после массива. Каждый объект:
{"task_label": "...", "question_text": "...", "item_type": "..."}

Где:
- task_label — краткая метка блока/задания, например "Task 1 · True/False" или "Discussion". Если метки нет — пустая строка.
- question_text — сам вопрос/утверждение/предложение, на которое отвечает ученик (одна единица = один объект).
- item_type — тип вопроса, одно из:
  - "tf"   — True/False/Not Stated (верно/неверно)
  - "mcq"  — выбор одного варианта из нескольких (A/B/C/D)
  - "gap"  — заполнить пропуск / вставить слово
  - "open" — открытый ответ (comprehension, discussion, перевод, полное предложение)
  - "other" — всё остальное

Каждое утверждение True/False, каждый вопрос MCQ, каждый пропуск, каждое предложение на перевод — ОТДЕЛЬНЫЙ объект. Не включай справочные блоки (Vocabulary List, читаемый текст) как вопросы. Только то, на что ученик реально отвечает.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Map internal age code to human-readable English for prompts
function ageLabel(ageGroup: string | undefined): string {
  if (ageGroup === "teen") return "teenager";
  if (ageGroup === "young_adult") return "young adult";
  return "adult";
}

// Select the right prompt template and fill in parameters
function buildPrompt(
  moduleType: ModuleType,
  params: ClarifyingParams,
  userInput: string
): string {
  const level = params.level ?? "B1";
  const age = ageLabel(params.ageGroup);
  const verb = params.targetVerb ?? "";
  const levelDesc = LEVEL_GUIDE[level] ?? LEVEL_GUIDE.B1;

  const templates: Record<ModuleType, string> = {
    READING_MODULE: READING_PROMPT,
    VOCABULARY_MODULE: VOCABULARY_PROMPT,
    TRANSLATION_TEXTS: TRANSLATION_TEXTS_PROMPT,
    TRANSLATION_SENTENCES: TRANSLATION_SENTENCES_PROMPT,
    VERB_SENTENCES: VERB_SENTENCES_PROMPT,
  };

  return templates[moduleType]
    .replace(/{INPUT}/g, userInput)
    .replace(/{LEVEL_DESC}/g, levelDesc)
    .replace(/{LEVEL}/g, level)
    .replace(/{AGE}/g, age)
    .replace(/{VERB}/g, verb);
}

// Normalize the Anthropic response usage into our LlmUsage shape. The SDK types cache fields as
// `number | null`, so accept null/undefined and fold both to 0 via `?? 0`.
function toUsage(message: {
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null;
}): LlmUsage {
  const u = message.usage ?? {};
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
// Optional `onUsage` reports token usage from the Anthropic response (input/output/cache tokens)
// so callers can meter spend per user. Awaited before returning so the record is written within the
// request lifecycle; callers must make it non-throwing (usage logging must never break generation).

// Generate student assignment content for the given module type and parameters
export async function generateModuleContent(
  moduleType: ModuleType,
  params: ClarifyingParams,
  userInput: string,
  onUsage?: (u: LlmUsage) => void | Promise<void>
): Promise<string> {
  const prompt = buildPrompt(moduleType, params, userInput);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  await onUsage?.(toUsage(message));
  return (message.content[0] as { text: string }).text;
}

// Generate teacher guide from existing student content
export async function generateTeacherGuide(
  studentContent: string,
  onUsage?: (u: LlmUsage) => void | Promise<void>
): Promise<string> {
  const prompt = TEACHER_GUIDE_PROMPT.replace("{STUDENT_CONTENT}", studentContent);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  await onUsage?.(toUsage(message));
  return (message.content[0] as { text: string }).text;
}

const ITEM_TYPES: readonly HomeworkItemType[] = ["tf", "mcq", "open", "gap", "other"];

// Coerce one loosely-typed value into a valid HomeworkItem, or null if it has no usable question text.
function toHomeworkItem(raw: unknown): HomeworkItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const question = typeof r.question_text === "string" ? r.question_text.trim() : "";
  if (!question) return null;
  const label = typeof r.task_label === "string" ? r.task_label.trim() : "";
  const type = typeof r.item_type === "string" && (ITEM_TYPES as readonly string[]).includes(r.item_type)
    ? (r.item_type as HomeworkItemType)
    : "other";
  return { task_label: label, question_text: question, item_type: type };
}

// Tolerantly parse the model's reply into HomeworkItem[]: try whole-body JSON, then the first [...] block; [] on failure.
function parseItems(reply: string): HomeworkItem[] {
  const attempts: string[] = [];
  const trimmed = reply.trim();
  if (trimmed) attempts.push(trimmed);
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) attempts.push(match[0]);
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      const items = parsed.map(toHomeworkItem).filter((i): i is HomeworkItem => i !== null);
      return items;
    } catch {
      // try the next candidate
    }
  }
  return [];
}

// Itemize free-text homework content into structured questions. Best-effort: returns [] on any failure.
export async function itemizeHomework(
  content: string,
  onUsage?: (u: LlmUsage) => void | Promise<void>
): Promise<HomeworkItem[]> {
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: ITEMIZE_PROMPT.replace("{CONTENT}", content) }],
    });
    await onUsage?.(toUsage(message));
    const reply = (message.content[0] as { text?: string })?.text ?? "";
    return parseItems(reply);
  } catch {
    return [];
  }
}

// Apply targeted edits to an existing assignment
export async function applyEdit(
  original: string,
  editRequest: string,
  onUsage?: (u: LlmUsage) => void | Promise<void>
): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Вот задание по английскому:\n\n${original}\n\nВнеси следующие правки: ${editRequest}\n\nВерни полное исправленное задание, сохранив всю структуру и форматирование.`,
    }],
  });
  await onUsage?.(toUsage(message));
  return (message.content[0] as { text: string }).text;
}
