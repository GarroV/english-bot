# Module Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 module types (Reading, Vocabulary, Translation Texts, Translation Sentences) with per-module prompts, inline parameter selection, and optional teacher-guide PDF generation.

**Architecture:** Detect module type from free-form input, transition to a new `CLARIFYING` state where the user picks level/age/version via inline buttons, then generate using a module-specific Claude prompt. Teacher version generates two PDFs (student + teacher guide).

**Tech Stack:** Deno/TypeScript, @anthropic-ai/sdk (claude-sonnet-4-20250514), Telegram Bot API, Supabase (Postgres + pgvector), pdf-lib

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `lib/types.ts` | Add `ModuleType`, `ClarifyingParams`, `CLARIFYING` state, update `SessionContext` |
| Create | `lib/module_detect.ts` | Pure functions: `detectModule()`, `extractParams()` |
| Create | `lib/module_detect.test.ts` | Unit tests for detection and extraction |
| Modify | `lib/claude.ts` | 4 module prompts + teacher guide prompt, `generateModuleContent()`, `generateTeacherGuide()` |
| Modify | `lib/utils.ts` | Update `makeFilename()` for new `Module: ...` header format; add `makeTeacherFilename()` |
| Modify | `lib/utils.test.ts` | Add tests for updated `makeFilename()` and `makeTeacherFilename()` |
| Modify | `handlers/request.ts` | Replace simple confirm with module detection → CLARIFYING |
| Create | `handlers/clarify.ts` | `buildClarifyMessage()`, `handleClarifyParam()`, `handleClarifyConfirm()` |
| Modify | `handlers/generate.ts` | Accept module params, route to module-specific generation, handle teacher version |
| Modify | `handlers/pdf_download.ts` | Send two PDFs when teacher content is present in session |
| Modify | `index.ts` | Route `clr_*` callback data to clarify handlers |
| Create | `supabase/migrations/20260515000001_add_module_type.sql` | Add `module_type` column to `eb_assignments` |

---

### Task 1: Update Types

**Files:**
- Modify: `supabase/functions/english-bot/lib/types.ts`

- [ ] **Step 1: Edit `types.ts`**

Replace the entire file with:

```typescript
export type ModuleType =
  | "READING_MODULE"
  | "VOCABULARY_MODULE"
  | "TRANSLATION_TEXTS"
  | "TRANSLATION_SENTENCES";

export interface ClarifyingParams {
  level?: string;      // "A2" | "B1" | "B2" | "C1" | "C2"
  ageGroup?: string;   // "teen" | "young_adult" | "adult"
  version?: string;    // "student" | "teacher"
}

export type State =
  | "REGISTERING"
  | "WAITING_REQUEST"
  | "CLARIFYING"
  | "CACHE_OFFER"
  | "POST_GENERATION"
  | "EDITING";

export interface SessionContext {
  last_request?: string;
  current_assignment?: string;
  current_assignment_teacher?: string;
  cached_assignment_id?: string;
  invite_pending?: boolean;
  module_type?: ModuleType;
  params?: ClarifyingParams;
}

export interface DbSession {
  telegram_id: number;
  state: State;
  context: SessionContext;
  updated_at: string;
}

export interface DbUser {
  telegram_id: number;
  username?: string;
  name: string;
  invited_by?: number;
  created_at: string;
}

export interface DbAssignment {
  id: string;
  telegram_id: number;
  level: string;
  topic: string;
  age_group: string;
  module_type: string;
  request_text: string;
  content: string;
  created_at: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgMessage {
  message_id: number;
  from: TgUser;
  chat: { id: number };
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message: TgMessage;
  data: string;
}

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/types.ts
git commit -m "feat: add ModuleType, ClarifyingParams, CLARIFYING state to types"
```

---

### Task 2: Module Detection

**Files:**
- Create: `supabase/functions/english-bot/lib/module_detect.ts`
- Create: `supabase/functions/english-bot/lib/module_detect.test.ts`

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/english-bot/lib/module_detect.test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert";
import { detectModule, extractParams } from "./module_detect.ts";

Deno.test("detectModule: translation texts keywords", () => {
  assertEquals(detectModule("нужны переводные тексты B2"), "TRANSLATION_TEXTS");
  assertEquals(detectModule("перевод текстов с русского"), "TRANSLATION_TEXTS");
  assertEquals(detectModule("переводные тексты по публицистике"), "TRANSLATION_TEXTS");
});

Deno.test("detectModule: translation sentences keywords", () => {
  assertEquals(detectModule("переводные предложения по модальным глаголам"), "TRANSLATION_SENTENCES");
  assertEquals(detectModule("перевод предложений, грамматика сослагательного"), "TRANSLATION_SENTENCES");
  assertEquals(detectModule("изолированные предложения на Past Perfect"), "TRANSLATION_SENTENCES");
});

Deno.test("detectModule: vocabulary keywords", () => {
  assertEquals(detectModule("погонять лексику по теме еда"), "VOCABULARY_MODULE");
  assertEquals(detectModule("словарные упражнения без текста"), "VOCABULARY_MODULE");
  assertEquals(detectModule("лексика по теме путешествия"), "VOCABULARY_MODULE");
});

Deno.test("detectModule: reading is default", () => {
  assertEquals(detectModule("B2, бизнес, взрослый"), "READING_MODULE");
  assertEquals(detectModule("прочитали книгу Animal Farm"), "READING_MODULE");
  assertEquals(detectModule("посмотрели фильм Parasite"), "READING_MODULE");
  assertEquals(detectModule("текст по теме климат"), "READING_MODULE");
});

Deno.test("extractParams: detects level", () => {
  assertEquals(extractParams("C1 модальные глаголы").level, "C1");
  assertEquals(extractParams("B2, бизнес").level, "B2");
  assertEquals(extractParams("a2 еда").level, "A2");
});

Deno.test("extractParams: detects age group", () => {
  assertEquals(extractParams("B1 подросток").ageGroup, "teen");
  assertEquals(extractParams("B1 взрослый").ageGroup, "adult");
  assertEquals(extractParams("B1 молодой взрослый").ageGroup, "young_adult");
  assertEquals(extractParams("B1 молодые взрослые").ageGroup, "young_adult");
});

Deno.test("extractParams: returns undefined for unknown fields", () => {
  const p = extractParams("перевод предложений");
  assertEquals(p.level, undefined);
  assertEquals(p.ageGroup, undefined);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/module_detect.test.ts --allow-env 2>&1 | head -20
```

Expected: error — `module_detect.ts` does not exist yet.

- [ ] **Step 3: Implement `module_detect.ts`**

Create `supabase/functions/english-bot/lib/module_detect.ts`:

```typescript
import type { ModuleType, ClarifyingParams } from "./types.ts";

// Detect which module type best fits the user's free-form request
export function detectModule(input: string): ModuleType {
  const s = input.toLowerCase();
  if (/переводн\w* текст|перевод текст|с русского на|перевод\w* по жанр/.test(s)) {
    return "TRANSLATION_TEXTS";
  }
  if (/переводн\w* предложен|перевод предложен|грамматик|модальн\w* глаго|изолирован\w* предложен/.test(s)) {
    return "TRANSLATION_SENTENCES";
  }
  if (/лексик|словарн|погонять|без текста|словарный запас/.test(s)) {
    return "VOCABULARY_MODULE";
  }
  return "READING_MODULE";
}

// Extract level and age group if they appear explicitly in the request
export function extractParams(input: string): ClarifyingParams {
  const s = input.toLowerCase();
  const levelMatch = s.match(/\b(a1|a2|b1|b2|c1|c2)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : undefined;

  let ageGroup: string | undefined;
  if (/молод\w* взрослы/.test(s)) {
    ageGroup = "young_adult";
  } else if (/подросток|подростк/.test(s)) {
    ageGroup = "teen";
  } else if (/взрослый|взрослых|взрослым/.test(s)) {
    ageGroup = "adult";
  }

  return { level, ageGroup };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/module_detect.test.ts --allow-env
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/english-bot/lib/module_detect.ts supabase/functions/english-bot/lib/module_detect.test.ts
git commit -m "feat: add module detection with unit tests"
```

---

### Task 3: Module-Specific Claude Prompts

**Files:**
- Modify: `supabase/functions/english-bot/lib/claude.ts`

- [ ] **Step 1: Replace `claude.ts` with module-aware implementation**

```typescript
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

// Apply targeted edits to an existing assignment (unchanged from original)
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
```

> Note: `generateAssignment()` (the old function used in `generate.ts`) is removed. We'll update `generate.ts` to call `generateModuleContent()` in Task 6.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/claude.ts
git commit -m "feat: add module-specific Claude prompts and generateModuleContent/generateTeacherGuide"
```

---

### Task 4: Update `utils.ts` for New First-Line Format

**Files:**
- Modify: `supabase/functions/english-bot/lib/utils.ts`
- Modify: `supabase/functions/english-bot/lib/utils.test.ts`

The new first line format is: `Module: Reading · Level: B2 · Topic: Crime and Justice · Age: adult`  
Old format was: `Level: A2 · Topic: Food and Restaurants · Age group: Teenager`

Both formats keep `Level:` and `Topic:`, so the current regex still works — but we should add `makeTeacherFilename()` and verify both formats in tests.

- [ ] **Step 1: Write failing tests first**

Add to `utils.test.ts` (append, don't replace existing tests):

```typescript
Deno.test("makeFilename: works with new Module: prefix format", () => {
  const text = "Module: Reading · Level: B2 · Topic: Crime and Justice · Age: adult\n\nSome text";
  assertEquals(makeFilename(text), "B2_Crime_and_Justice.pdf");
});

Deno.test("makeFilename: works with Translation module", () => {
  const text = "Module: Translation (Texts) · Level: C1 · Topic: Politics\n\nSome text";
  assertEquals(makeFilename(text), "C1_Politics.pdf");
});

Deno.test("makeTeacherFilename: adds _teacher suffix", () => {
  const text = "Teacher's Guide · Module: Reading · Level: B2 · Topic: Crime and Justice";
  assertEquals(makeTeacherFilename(text), "B2_Crime_and_Justice_teacher.pdf");
});
```

Also add `makeTeacherFilename` to the import line in the test file:
```typescript
import { makeFilename, makeTeacherFilename, splitIfLong, normalizeRequest, generateInviteCode } from "./utils.ts";
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/utils.test.ts --allow-env 2>&1 | tail -10
```

Expected: error — `makeTeacherFilename` not exported.

- [ ] **Step 3: Add `makeTeacherFilename` to `utils.ts`**

Append to the end of `utils.ts`:

```typescript
// Generate teacher guide PDF filename by appending _teacher before the extension
export function makeTeacherFilename(text: string): string {
  const base = makeFilename(text);
  return base.replace(".pdf", "_teacher.pdf");
}
```

- [ ] **Step 4: Run all utils tests**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/utils.test.ts --allow-env
```

Expected: all tests pass (original 5 + new 3 = 8 total).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/english-bot/lib/utils.ts supabase/functions/english-bot/lib/utils.test.ts
git commit -m "feat: add makeTeacherFilename, update utils tests for new module header format"
```

---

### Task 5: Update Request Handler

**Files:**
- Modify: `supabase/functions/english-bot/handlers/request.ts`

Currently `handleRequest` sends a confirmation message. Now it should detect the module type, extract any known params, and transition to `CLARIFYING` state.

- [ ] **Step 1: Replace `handlers/request.ts`**

```typescript
import { sendMessage, answerCallbackQuery, editMessageText } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import { detectModule, extractParams } from "../lib/module_detect.ts";
import { buildClarifyMessage } from "./clarify.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Handle free-form text in WAITING_REQUEST state: detect module, enter CLARIFYING
export async function handleRequest(message: TgMessage): Promise<void> {
  const userInput = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const userId = message.from.id;

  const moduleType = detectModule(userInput);
  const params = extractParams(userInput);

  await setSession(userId, "CLARIFYING", {
    last_request: userInput,
    module_type: moduleType,
    params,
  });

  const { text, kb } = buildClarifyMessage(moduleType, params);
  await sendMessage(chatId, text, kb);
}

// Handle the "change_request" callback button: go back to WAITING_REQUEST
export async function handleChangeRequest(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "WAITING_REQUEST");
  await editMessageText(
    query.message.chat.id,
    query.message.message_id,
    "Напиши новый запрос:"
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/request.ts
git commit -m "feat: request handler detects module type and enters CLARIFYING state"
```

---

### Task 6: Create Clarify Handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/clarify.ts`

This file handles all `clr_*` callbacks. It also exports `buildClarifyMessage` which is used by `request.ts`.

- [ ] **Step 1: Create `handlers/clarify.ts`**

```typescript
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
// "Генерировать" button is shown when level is set (or for translation, always).
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
  const ageLine = params.ageGroup ? ` · ${ageOptions.find(([, v]) => v === params.ageGroup)?.[0] ?? ""}` : "";
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
  const params: ClarifyingParams = session.context.params ?? {};
  const userInput = session.context.last_request ?? "";

  // Apply defaults for missing params
  if (!params.level) params.level = "B1";
  if (!params.ageGroup) params.ageGroup = "adult";
  if (!params.version) params.version = "student";

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/clarify.ts
git commit -m "feat: add clarify handler with buildClarifyMessage, param selection, and confirm"
```

---

### Task 7: Update Generate Handler

**Files:**
- Modify: `supabase/functions/english-bot/handlers/generate.ts`

The existing handler uses the old `generateAssignment()` function and the `CONFIRMING` state. Replace it to use `generateModuleContent()` and `generateTeacherGuide()`.

- [ ] **Step 1: Replace `handlers/generate.ts`**

```typescript
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

// Send the assignment with action buttons. Show PDF download as "Скачать PDF(ы)" when teacher version exists.
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/generate.ts
git commit -m "feat: update generate handler to use module-specific generation and teacher guide"
```

---

### Task 8: Update `db.ts` — saveAssignment Accepts `moduleType`

**Files:**
- Modify: `supabase/functions/english-bot/lib/db.ts`

- [ ] **Step 1: Update `saveAssignment` signature in `db.ts`**

Find the `saveAssignment` function and replace it:

```typescript
// Embed the assignment parameters and store the record with its vector in eb_assignments
export async function saveAssignment(params: {
  telegramId: number;
  level: string;
  topic: string;
  ageGroup: string;
  moduleType: string;
  requestText: string;
  content: string;
}): Promise<void> {
  const embeddingInput = `${params.level} ${params.topic} ${params.ageGroup}`;
  const embedding = await embed(embeddingInput);
  await supabase.from("eb_assignments").insert({
    telegram_id: params.telegramId,
    level: params.level,
    topic: params.topic,
    age_group: params.ageGroup,
    module_type: params.moduleType,
    request_text: params.requestText,
    content: params.content,
    embedding,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/db.ts
git commit -m "feat: saveAssignment now stores module_type"
```

---

### Task 9: Update PDF Download Handler

**Files:**
- Modify: `supabase/functions/english-bot/handlers/pdf_download.ts`

When session has `current_assignment_teacher`, send two PDFs.

- [ ] **Step 1: Replace `handlers/pdf_download.ts`**

```typescript
import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename, makeTeacherFilename } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

export async function handleDownloadPdf(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const session = await getSession(query.from.id);
  const chatId = query.message.chat.id;
  const studentText = session?.context.current_assignment ?? "";
  const teacherText = session?.context.current_assignment_teacher;

  try {
    const studentBytes = await generatePdf(studentText);
    const studentFilename = makeFilename(studentText);
    await sendDocument(chatId, studentFilename, studentBytes, teacherText ? "Студенческая версия" : "Готово!");

    if (teacherText) {
      const teacherBytes = await generatePdf(teacherText);
      const teacherFilename = makeTeacherFilename(teacherText);
      await sendDocument(chatId, teacherFilename, teacherBytes, "Версия для учителя");
    }
  } catch (e) {
    await sendMessage(chatId, `Ошибка при создании PDF: ${e}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/pdf_download.ts
git commit -m "feat: pdf_download sends two files when teacher version is present"
```

---

### Task 10: Update `index.ts` Routing

**Files:**
- Modify: `supabase/functions/english-bot/index.ts`

Remove the old `handleConfirm`/`handleChangeRequest` imports, add clarify handler routes.

- [ ] **Step 1: Replace `index.ts`**

```typescript
import { handleStart, handleInviteCode } from "./handlers/start.ts";
import { handleRequest, handleChangeRequest } from "./handlers/request.ts";
import {
  handleClarifyParam,
  handleClarifyConfirm,
} from "./handlers/clarify.ts";
import {
  handleUseCached,
  handleGenerateNew,
  handleNewAssignment,
} from "./handlers/generate.ts";
import { handleEditAssignment, handleApplyEdit } from "./handlers/edit.ts";
import { handleDownloadPdf } from "./handlers/pdf_download.ts";
import { handleInvite, handleUsers } from "./handlers/admin.ts";
import { isAllowed, getSession } from "./lib/db.ts";
import { sendMessage } from "./lib/telegram.ts";
import type { TgUpdate } from "./lib/types.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  let chatId: number | null = null;
  try {
    const update: TgUpdate = await req.json();
    chatId = update.message?.chat.id ?? update.callback_query?.message.chat.id ?? null;
    await route(update);
  } catch (e) {
    console.error("Unhandled error:", e);
    if (chatId) {
      try {
        await sendMessage(chatId, "Что-то пошло не так. Попробуй ещё раз через минуту.");
      } catch (_) { /* ignore send failure */ }
    }
  }

  return new Response("OK", { status: 200 });
});

// Route an incoming Telegram update to the correct handler
async function route(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    const query = update.callback_query;
    if (!(await isAllowed(query.from.id))) return;

    const { data } = query;

    // Parameter selection buttons in CLARIFYING state
    if (data.startsWith("clr_level_") || data.startsWith("clr_age_") || data.startsWith("clr_ver_")) {
      return handleClarifyParam(query);
    }
    if (data === "clr_confirm") return handleClarifyConfirm(query);

    if (data === "change_request") return handleChangeRequest(query);
    if (data === "use_cached") return handleUseCached(query);
    if (data === "generate_new") return handleGenerateNew(query);
    if (data === "edit_assignment") return handleEditAssignment(query);
    if (data === "download_pdf") return handleDownloadPdf(query);
    if (data === "new_assignment") return handleNewAssignment(query);
    return;
  }

  if (update.message) {
    const message = update.message;
    const text = message.text ?? "";
    const userId = message.from.id;
    const chatId = message.chat.id;

    if (text === "/start") return handleStart(message);
    if (text === "/invite") return handleInvite(message);
    if (text === "/users") return handleUsers(message);

    const session = await getSession(userId);

    if (!(await isAllowed(userId))) {
      if (session?.state === "REGISTERING") {
        return handleInviteCode(message);
      }
      await sendMessage(chatId, "Привет! Напиши /start чтобы начать.");
      return;
    }

    const state = session?.state ?? "WAITING_REQUEST";
    if (state === "WAITING_REQUEST") return handleRequest(message);
    if (state === "EDITING") return handleApplyEdit(message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/index.ts
git commit -m "feat: route clr_* callbacks to clarify handler, remove old confirm route"
```

---

### Task 11: DB Migration — Add `module_type` Column

**Files:**
- Create: `supabase/migrations/20260515000001_add_module_type.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add module_type to distinguish READING, VOCABULARY, and TRANSLATION caches
alter table eb_assignments
  add column module_type text default 'READING_MODULE';
```

- [ ] **Step 2: Apply migration locally (if Supabase CLI is running)**

```bash
cd /Users/garva/english_bot && supabase db push 2>&1 || echo "apply via dashboard if not running locally"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260515000001_add_module_type.sql
git commit -m "feat: add module_type column to eb_assignments"
```

---

### Task 12: Run All Tests

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/ --allow-env --allow-net 2>&1
```

Expected: all tests in `utils.test.ts` and `module_detect.test.ts` pass.

- [ ] **Step 2: Final commit if any cleanup needed**

```bash
git status
```

If clean: done. If any unstaged changes: review and commit.

---

## Self-Review

### Spec Coverage

| Spec requirement | Covered by |
|---|---|
| READING_MODULE structure (text + 8 task types) | Task 3 — `READING_PROMPT` |
| VOCABULARY_MODULE (no text, starts with vocab list) | Task 3 — `VOCABULARY_PROMPT` |
| TRANSLATION_TEXTS (4-5 genre texts, no instructions/answers) | Task 3 — `TRANSLATION_TEXTS_PROMPT` |
| TRANSLATION_SENTENCES (blocks by grammar topic, no hints) | Task 3 — `TRANSLATION_SENTENCES_PROMPT` |
| One clarifying message with buttons | Tasks 5 + 6 — `buildClarifyMessage` |
| Don't ask what's obvious from the request | Task 2 — `extractParams` pre-fills known values |
| Level buttons A2-C2 | Task 6 — `LEVELS` array in `clarify.ts` |
| Age buttons | Task 6 — `ageOptions` in `clarify.ts` |
| Version buttons (student / teacher) | Task 6 — `versionOptions` in `clarify.ts` |
| Version hidden for translation modules | Task 6 — conditional in `buildClarifyMessage` |
| Teacher version = two PDFs (student + teacher guide) | Tasks 7 + 9 |
| Translation always one file, no answers | Task 3 — prompts + Task 7 — version check |
| Matching as table not list | Task 3 — prompt instructs format |
| True/False with marking space and explanation line | Task 3 — prompt instructs format |
| No answers in student version | Task 3 — all prompts |
| Only one clarifying question | Task 6 — single message, all params in one |
| Max one clarifying question per flow | Task 5 — `handleRequest` sends one message |
| Cache skip for translation | Task 6 — `handleClarifyConfirm`, `generateAndSend` |
| DB column for module_type | Task 11 |

### Placeholder Scan

No TBD, TODO, or "similar to Task N" references found.

### Type Consistency

- `ClarifyingParams` defined in `types.ts` Task 1, used consistently across `clarify.ts`, `generate.ts`, `request.ts`, `claude.ts`
- `ModuleType` defined in `types.ts` Task 1, used in all relevant files
- `generateModuleContent(moduleType, params, userInput)` — same signature in `claude.ts` Task 3 and call site in `generate.ts` Task 7
- `generateTeacherGuide(studentContent)` — same signature in `claude.ts` Task 3 and call site in `generate.ts` Task 7
- `generateAndSend({ userId, chatId, userInput, moduleType, params })` — same shape in `clarify.ts` Task 6 (dynamic import) and `generate.ts` Task 7 (export)
- `makeTeacherFilename(text)` — defined in `utils.ts` Task 4, imported in `pdf_download.ts` Task 9
- `buildClarifyMessage(moduleType, params)` — exported from `clarify.ts` Task 6, imported in `request.ts` Task 5
