# Verb Sentences Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `VERB_SENTENCES` module type that generates 20 Russian-to-English translation sentences targeting a specific verb; if the verb is missing from the user's request, the bot asks for it before generating.

**Architecture:** New `VERB_SENTENCES` value added to the `ModuleType` union propagates through types → detection → prompt → clarify UI → state machine. A new `WAITING_VERB` state handles the case where the verb was not supplied in the original request. The verb is stored in `ClarifyingParams.targetVerb` and injected into the Claude prompt.

**Tech Stack:** Deno, TypeScript, Supabase Edge Functions, Telegram Bot API, Anthropic Claude API.

---

### Task 1: Extend types

**Files:**
- Modify: `supabase/functions/english-bot/lib/types.ts`

- [ ] **Step 1: Add `VERB_SENTENCES` to `ModuleType`, `WAITING_VERB` to `State`, and `targetVerb` to `ClarifyingParams`**

Replace the current `types.ts` content for those three declarations:

```typescript
export type ModuleType =
  | "READING_MODULE"
  | "VOCABULARY_MODULE"
  | "TRANSLATION_TEXTS"
  | "TRANSLATION_SENTENCES"
  | "VERB_SENTENCES";

export interface ClarifyingParams {
  level?: string;      // "A2" | "B1" | "B2" | "C1" | "C2"
  ageGroup?: string;   // "teen" | "young_adult" | "adult"
  version?: string;    // "student" | "teacher"
  targetVerb?: string; // e.g. "must / have to"
}

export type State =
  | "REGISTERING"
  | "WAITING_REQUEST"
  | "CLARIFYING"
  | "WAITING_TOPIC"
  | "WAITING_VERB"
  | "CACHE_OFFER"
  | "POST_GENERATION"
  | "EDITING";
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/types.ts
git commit -m "feat: add VERB_SENTENCES module type and WAITING_VERB state"
```

---

### Task 2: Detection — add `extractVerb` and update `detectModule`

**Files:**
- Modify: `supabase/functions/english-bot/lib/module_detect.ts`
- Modify: `supabase/functions/english-bot/lib/module_detect.test.ts`

- [ ] **Step 1: Write failing tests first**

Add to `module_detect.test.ts`:

```typescript
Deno.test("detectModule: verb sentences keyword", () => {
  assertEquals(detectModule("задание на глаголы must и have to"), "VERB_SENTENCES");
  assertEquals(detectModule("упражнение на глагол can, B1"), "VERB_SENTENCES");
  assertEquals(detectModule("задание на глаголы should, C1, подросток"), "VERB_SENTENCES");
});

Deno.test("detectModule: verb sentences does not catch translation sentences", () => {
  assertEquals(detectModule("переводные предложения по модальным глаголам"), "TRANSLATION_SENTENCES");
});

Deno.test("extractVerb: finds verb after глагол", () => {
  assertEquals(extractVerb("задание на глаголы must и have to"), "must и have to");
  assertEquals(extractVerb("задание на глагол can, B1"), "can");
  assertEquals(extractVerb("упражнение на глаголы should / ought to"), "should / ought to");
});

Deno.test("extractVerb: returns empty string when no verb found", () => {
  assertEquals(extractVerb("задание на глаголы"), "");
  assertEquals(extractVerb("задание на глаголы, B2"), "");
  assertEquals(extractVerb("reading B2"), "");
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
deno test supabase/functions/english-bot/lib/module_detect.test.ts --allow-env
```

Expected: FAIL — `extractVerb is not a function` and VERB_SENTENCES not detected.

- [ ] **Step 3: Implement in `module_detect.ts`**

Add `extractVerb` export and insert the new detection branch **before** the `TRANSLATION_SENTENCES` check:

```typescript
import type { ModuleType, ClarifyingParams } from "./types.ts";

// Detect which module type best fits the user's free-form request
export function detectModule(input: string): ModuleType {
  const s = input.toLowerCase();
  // Translation texts: "переводные тексты", "перевод текстов", "с русского", "по жанру"
  if (/переводн.*текст|перевод.*текст|с русского|по жанр/.test(s)) {
    return "TRANSLATION_TEXTS";
  }
  // Verb sentences: "задание на глаголы X" or "упражнение на глагол X"
  if (/задание на глагол|упражнение на глагол/.test(s)) {
    return "VERB_SENTENCES";
  }
  // Translation sentences: "переводные предложения", "грамматика", "модальные глаголы", "изолированные предложения"
  if (/переводн.*предложен|перевод.*предложен|грамматик|модальн.*глаго|изолирован.*предложен/.test(s)) {
    return "TRANSLATION_SENTENCES";
  }
  // Vocabulary: "лексика", "словарные", "погонять", "без текста"
  if (/лексик|словарн|погонять|без текста/.test(s)) {
    return "VOCABULARY_MODULE";
  }
  return "READING_MODULE";
}

// Extract the target verb(s) from a VERB_SENTENCES request.
// Matches text after "глагол" until the first comma or end of string.
// Returns empty string when no verb is found.
export function extractVerb(input: string): string {
  const match = input.match(/глаголы?\s+([^,\n]+)/i);
  if (!match) return "";
  const verb = match[1].trim();
  // If the extracted part looks like a level (A2/B1/etc.) or age, it's not a verb
  if (/^(a1|a2|b1|b2|c1|c2|взросл|подрост|молод)/i.test(verb)) return "";
  return verb;
}

// Extract level and age group if they appear explicitly in the request
export function extractParams(input: string): ClarifyingParams {
  const s = input.toLowerCase();
  const levelMatch = s.match(/\b(a1|a2|b1|b2|c1|c2)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : undefined;

  let ageGroup: string | undefined;
  if (/молод[а-я\w]*\s+взрослы|молод[а-я\w]*\s+взрослый/.test(s)) {
    ageGroup = "young_adult";
  } else if (/подросток|подростк/.test(s)) {
    ageGroup = "teen";
  } else if (/взрослый|взрослых|взрослым/.test(s)) {
    ageGroup = "adult";
  }

  return { level, ageGroup };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
deno test supabase/functions/english-bot/lib/module_detect.test.ts --allow-env
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/english-bot/lib/module_detect.ts supabase/functions/english-bot/lib/module_detect.test.ts
git commit -m "feat: detect VERB_SENTENCES module type, add extractVerb"
```

---

### Task 3: Add Claude prompt for VERB_SENTENCES

**Files:**
- Modify: `supabase/functions/english-bot/lib/claude.ts`

- [ ] **Step 1: Add the prompt constant**

Add after `TRANSLATION_SENTENCES_PROMPT` in `claude.ts`:

```typescript
const VERB_SENTENCES_PROMPT = `Ты опытный преподаватель английского языка. Создай упражнение на перевод предложений.

Запрос: {INPUT}
Глагол(ы): {VERB}
Уровень: {LEVEL}

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
```

- [ ] **Step 2: Update `buildPrompt` to handle `VERB_SENTENCES`**

Replace the `templates` object and the return in `buildPrompt`:

```typescript
function buildPrompt(
  moduleType: ModuleType,
  params: ClarifyingParams,
  userInput: string
): string {
  const level = params.level ?? "B1";
  const age = ageLabel(params.ageGroup);
  const verb = params.targetVerb ?? "";

  const templates: Record<ModuleType, string> = {
    READING_MODULE: READING_PROMPT,
    VOCABULARY_MODULE: VOCABULARY_PROMPT,
    TRANSLATION_TEXTS: TRANSLATION_TEXTS_PROMPT,
    TRANSLATION_SENTENCES: TRANSLATION_SENTENCES_PROMPT,
    VERB_SENTENCES: VERB_SENTENCES_PROMPT,
  };

  return templates[moduleType]
    .replace(/{INPUT}/g, userInput)
    .replace(/{LEVEL}/g, level)
    .replace(/{AGE}/g, age)
    .replace(/{VERB}/g, verb);
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/english-bot/lib/claude.ts
git commit -m "feat: add VERB_SENTENCES Claude prompt"
```

---

### Task 4: Store `targetVerb` when module is detected in request handler

**Files:**
- Modify: `supabase/functions/english-bot/handlers/request.ts`

- [ ] **Step 1: Import `extractVerb` and populate `targetVerb` in session**

Replace `request.ts` entirely:

```typescript
import { sendMessage, answerCallbackQuery, editMessageText } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import { detectModule, extractParams, extractVerb } from "../lib/module_detect.ts";
import { buildClarifyMessage } from "./clarify.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Handle free-form text in WAITING_REQUEST state: detect module, enter CLARIFYING
export async function handleRequest(message: TgMessage): Promise<void> {
  const userInput = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const userId = message.from.id;

  const moduleType = detectModule(userInput);
  const params = extractParams(userInput);

  if (moduleType === "VERB_SENTENCES") {
    const verb = extractVerb(userInput);
    if (verb) params.targetVerb = verb;
  }

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
git commit -m "feat: extract and store targetVerb for VERB_SENTENCES requests"
```

---

### Task 5: Update clarify UI and add missing-verb flow

**Files:**
- Modify: `supabase/functions/english-bot/handlers/clarify.ts`

This is the biggest task. Changes:
1. Add "Глаголы (пред.)" to `MODULE_TYPE_OPTIONS`
2. Update `MODULE_LABELS`
3. Hide version row for `VERB_SENTENCES`
4. In `handleClarifyConfirm`: if `VERB_SENTENCES` and no `targetVerb` → set `WAITING_VERB` and ask
5. Add `handleVerbInput` export

- [ ] **Step 1: Update `MODULE_LABELS` and `MODULE_TYPE_OPTIONS`**

Replace the two constants near the top of `clarify.ts`:

```typescript
const MODULE_LABELS: Record<ModuleType, string> = {
  READING_MODULE: "Reading",
  VOCABULARY_MODULE: "Vocabulary",
  TRANSLATION_TEXTS: "Translation (тексты)",
  TRANSLATION_SENTENCES: "Translation (предложения)",
  VERB_SENTENCES: "Глаголы (предложения)",
};

const MODULE_TYPE_OPTIONS: [string, string][] = [
  ["Reading", "READING_MODULE"],
  ["Vocabulary", "VOCABULARY_MODULE"],
  ["Перевод (тексты)", "TRANSLATION_TEXTS"],
  ["Перевод (пред.)", "TRANSLATION_SENTENCES"],
  ["Глаголы (пред.)", "VERB_SENTENCES"],
];
```

- [ ] **Step 2: Update `buildClarifyMessage` — 5th module option row and hide version for VERB_SENTENCES**

Replace the rows-building section inside `buildClarifyMessage` (keep the rest of the function intact):

```typescript
export function buildClarifyMessage(
  moduleType: ModuleType,
  params: ClarifyingParams
): { text: string; kb: InlineKeyboard } {
  const rows: [string, string][][] = [];

  // Module type rows (2×2 + 1)
  rows.push(
    MODULE_TYPE_OPTIONS.slice(0, 2).map(([label, val]) => [
      `${moduleType === val ? "✓ " : ""}${label}`,
      `clr_type_${val}`,
    ])
  );
  rows.push(
    MODULE_TYPE_OPTIONS.slice(2, 4).map(([label, val]) => [
      `${moduleType === val ? "✓ " : ""}${label}`,
      `clr_type_${val}`,
    ])
  );
  rows.push(
    MODULE_TYPE_OPTIONS.slice(4).map(([label, val]) => [
      `${moduleType === val ? "✓ " : ""}${label}`,
      `clr_type_${val}`,
    ])
  );

  // Level row
  rows.push(
    LEVELS.map((l) => [`${params.level === l ? "✓ " : ""}${l}`, `clr_level_${l}`])
  );

  // Age row
  rows.push(
    AGE_OPTIONS.map(([label, val]) => [
      `${params.ageGroup === val ? "✓ " : ""}${label}`,
      `clr_age_${val}`,
    ])
  );

  // Version row — only for content modules (not translation or verb)
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

  // Generate button
  rows.push([["✅ Генерировать", "clr_confirm"]]);

  const levelLine = params.level ? ` · Уровень: ${params.level}` : "";
  const ageLine = params.ageGroup
    ? ` · ${AGE_OPTIONS.find(([, v]) => v === params.ageGroup)?.[0] ?? ""}`
    : "";
  const verbLine = moduleType === "VERB_SENTENCES" && params.targetVerb
    ? ` · Глагол: ${params.targetVerb}`
    : "";
  const text = `Тип: *${MODULE_LABELS[moduleType]}*${levelLine}${ageLine}${verbLine}\n\nВыбери параметры:`;

  return { text, kb: keyboard(rows) };
}
```

- [ ] **Step 3: Update `handleClarifyParam` — reset `targetVerb` when switching away from VERB_SENTENCES**

Inside `handleClarifyParam`, in the `if (data.startsWith("clr_type_"))` branch, add:

```typescript
if (data.startsWith("clr_type_")) {
  newModuleType = data.replace("clr_type_", "") as ModuleType;
  // Reset version when switching to translation types
  if (newModuleType === "TRANSLATION_TEXTS" || newModuleType === "TRANSLATION_SENTENCES" || newModuleType === "VERB_SENTENCES") {
    delete params.version;
  }
  // Reset targetVerb when switching away from VERB_SENTENCES
  if (newModuleType !== "VERB_SENTENCES") {
    delete params.targetVerb;
  }
}
```

- [ ] **Step 4: Update `handleClarifyConfirm` — ask for verb when missing**

In `handleClarifyConfirm`, after the defaults block (after the `if (!params.version ...)` lines), add the missing-verb check **before** the existing `if (!userInput)` check:

```typescript
  // Apply defaults for missing params
  if (!params.level) params.level = "B1";
  if (!params.ageGroup) params.ageGroup = "adult";
  if (!params.version && (moduleType === "READING_MODULE" || moduleType === "VOCABULARY_MODULE")) {
    params.version = "student";
  }

  // Verb sentences: ask for verb if not provided
  if (moduleType === "VERB_SENTENCES" && !params.targetVerb) {
    await setSession(userId, "WAITING_VERB", { ...session.context, params });
    await editMessageText(
      chatId,
      query.message.message_id,
      "Какой глагол? (например: must / have to)"
    );
    return;
  }

  // Menu-initiated flow: no topic yet — ask before generating
  if (!userInput) {
    // ... existing code unchanged
```

- [ ] **Step 5: Add `handleVerbInput` export at the bottom of `clarify.ts`**

```typescript
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
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/english-bot/handlers/clarify.ts
git commit -m "feat: add Verb Sentences to clarify UI, handle missing verb flow"
```

---

### Task 6: Route WAITING_VERB in index.ts

**Files:**
- Modify: `supabase/functions/english-bot/index.ts`

- [ ] **Step 1: Import `handleVerbInput`**

Replace the clarify imports block:

```typescript
import {
  handleClarifyParam,
  handleClarifyConfirm,
  handleTopicInput,
  handleVerbInput,
} from "./handlers/clarify.ts";
```

- [ ] **Step 2: Add route for `WAITING_VERB` state**

In the `route` function, in the state-based routing section, add after `WAITING_TOPIC`:

```typescript
    if (state === "WAITING_REQUEST") return handleRequest(message);
    if (state === "WAITING_TOPIC") return handleTopicInput(message);
    if (state === "WAITING_VERB") return handleVerbInput(message);
    if (state === "EDITING") return handleApplyEdit(message);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/english-bot/index.ts
git commit -m "feat: route WAITING_VERB state to handleVerbInput"
```

---

### Task 7: Run all tests, deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Run full test suite**

```bash
deno test supabase/functions/english-bot/lib/ --allow-env
```

Expected: all tests PASS.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy english-bot --no-verify-jwt
```

Expected: `Deployed Functions on project btlglelwxazdxfqdmcti: english-bot`

- [ ] **Step 3: Smoke test in Telegram**

Send to bot: `задание на глаголы must и have to, B2`
- Expected: clarify screen shows "✓ Глаголы (предложения)" and "Глагол: must и have to"
- Tap "✅ Генерировать" → bot generates 20 Russian sentences

Send to bot: `задание на глаголы, B1`
- Expected: clarify screen shown → tap "✅ Генерировать" → bot asks "Какой глагол?"
- Reply "can" → bot generates

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only what changed
git commit -m "chore: post-deploy cleanup"
```
