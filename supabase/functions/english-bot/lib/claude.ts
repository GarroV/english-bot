import Anthropic from "npm:@anthropic-ai/sdk";
import type { ModuleType, ClarifyingParams } from "./types.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_KEY") });

// ─── Prompts ──────────────────────────────────────────────────────────────────

const READING_PROMPT = `Ты опытный преподаватель английского языка. Создай Reading Module.

Запрос: {INPUT}
Уровень: {LEVEL}
Возраст: {AGE}

Структура:
1. Первая строка (до основного текста): Module: Reading · Level: {LEVEL} · Topic: [тема на английском] · Age: {AGE}
2. Авторский текст на английском
   - A2/B1: 150-200 слов, простые предложения, базовая лексика
   - B2/C1/C2: 200-300 слов, аналитика, реальные факты, без общих фраз
   - Нейтральный стиль — никаких имён героев, никакого "I travelled" / "My trip"
3. Vocabulary — 10-12 единиц: фразовые глаголы и/или коллокации из текста, с определением
4. Task 1 · True/False/NS — 6 утверждений
   - Под каждым: строка для пометки T / F / NS и строка для объяснения
   - A2: только T/F, без NS
5. Task 2 · Comprehension — 5 вопросов, ответить полными предложениями
6. Task 3 · MCQ — 4 вопроса с вариантами A/B/C/D
7. Task 4 · Gap fill — 6-8 предложений с пропусками (слова из текста, не подписывать список слов)
8. Task 5 · Word formation — 6 предложений (только B2+; пропустить для A2/B1)
9. Task 6 · Matching — таблица с двумя столбцами:
   Левый столбец: пронумерованные фразы/слова
   Правый столбец: буквенные определения/переводы (перемешаны)
   Формат: "1. phrase    a. meaning" — по одной паре на строку, выровнены пробелами
10. Task 7 · Error correction — 6 предложений с одной ошибкой каждое (только B2+; пропустить для A2/B1)
11. Task 8 · Key word transformation — 5 предложений (только C1/C2; пропустить для A2-B2)
12. Discussion questions — 4-5 вопросов
    - Всегда с личным углом: Have you ever...? Would you rather...?
    - C1/C2: провокационные тезисы, моральные дилеммы
    - A2/B1: конкретные, простые, один-два слова в ответе достаточно

Форматирование (строго):
- Matching — ТОЛЬКО таблицей, не списком, не нумерованным списком
- True/False — ВСЕГДА с местом для пометки и строкой для объяснения
- Никаких ответов в задании
- Никаких bullet points и headers внутри упражнений
- Никаких подсказок в скобках без явного запроса
- Заголовки блоков: Task 1 · True/False, Task 2 · Comprehension, и т.д.
- Никаких разделителей --- между блоками
- Никаких "Homework Assignment", "Good luck" и т.п.`;

const VOCABULARY_PROMPT = `Ты опытный преподаватель английского языка. Создай Vocabulary Module.

Запрос: {INPUT}
Уровень: {LEVEL}
Возраст: {AGE}

Структура:
1. Первая строка: Module: Vocabulary · Level: {LEVEL} · Topic: [тема на английском] · Age: {AGE}
2. Vocabulary List — 15-18 единиц с определениями (без текста для чтения)
   Формат: слово/фраза — краткое определение на английском
3. Task 1 · Matching — таблица два столбца (слово → определение/перевод)
   Формат: "1. phrase    a. meaning" — по одной паре на строку
4. Task 2 · MCQ — 6 предложений, выбор правильного слова из A/B/C/D
5. Task 3 · Gap fill — 8 предложений, вставить слово из Vocabulary List
6. Task 4 · Word formation — 6 предложений (только B2+; пропустить для A2/B1)
7. Task 5 · Collocations — 8 пар глагол+существительное или прилагательное+существительное
   Формат: таблица, левый столбец — слово, правый — варианты коллокаций
8. Task 6 · Error correction — 6 предложений с ошибкой в лексике (только B2+; пропустить для A2/B1)
9. Task 7 · Key word transformation — 5 предложений (только C1/C2; пропустить для A2-B2)
10. Discussion questions — 4-5 вопросов с личным углом (те же правила, что для Reading Module)

Форматирование — те же правила, что для Reading Module.`;

const TRANSLATION_TEXTS_PROMPT = `Ты опытный преподаватель английского языка. Создай Translation Module (тексты).

Запрос: {INPUT}
Уровень: {LEVEL}

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

Структура:
1. Первая строка: Module: Translation (Sentences) · Level: {LEVEL} · Topic: [грамматическая тема]
2. Три-четыре блока предложений для перевода с русского на английский.
   Каждый блок посвящён одному грамматическому явлению или подтеме.

   Каждый блок:
   - Заголовок: название явления (только название, без объяснений)
   - 8-12 пронумерованных предложений на русском
   - Предложения постепенно усложняются внутри блока

   C1/C2: Epistemic modality, conditional types mixing, subjunctive, inversion, cleft sentences.

Правила (строго):
- Только название блока — никаких объяснений, подсказок, скобок
- Никаких ответов
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
   - Word formation: правильная форма
   - Matching: номер → буква
   - Error correction: исправленная версия (только исправление, без объяснения)
   - Key word transformation: правильный вариант
   - Collocations: правильные пары
4. Discussion notes — для каждого вопроса: 1-2 предложения о возможных направлениях разговора

Форматирование:
- Короткие, чёткие ответы — никаких лишних объяснений
- Заголовки идентичны студенческой версии`;

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

  const templates: Record<ModuleType, string> = {
    READING_MODULE: READING_PROMPT,
    VOCABULARY_MODULE: VOCABULARY_PROMPT,
    TRANSLATION_TEXTS: TRANSLATION_TEXTS_PROMPT,
    TRANSLATION_SENTENCES: TRANSLATION_SENTENCES_PROMPT,
  };

  return templates[moduleType]
    .replace(/{INPUT}/g, userInput)
    .replace(/{LEVEL}/g, level)
    .replace(/{AGE}/g, age);
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Generate student assignment content for the given module type and parameters
export async function generateModuleContent(
  moduleType: ModuleType,
  params: ClarifyingParams,
  userInput: string
): Promise<string> {
  const prompt = buildPrompt(moduleType, params, userInput);
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  return (message.content[0] as { text: string }).text;
}

// Generate teacher guide from existing student content
export async function generateTeacherGuide(studentContent: string): Promise<string> {
  const prompt = TEACHER_GUIDE_PROMPT.replace("{STUDENT_CONTENT}", studentContent);
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  return (message.content[0] as { text: string }).text;
}

// Apply targeted edits to an existing assignment
export async function applyEdit(
  original: string,
  editRequest: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Вот задание по английскому:\n\n${original}\n\nВнеси следующие правки: ${editRequest}\n\nВерни полное исправленное задание, сохранив всю структуру и форматирование.`,
    }],
  });
  return (message.content[0] as { text: string }).text;
}
