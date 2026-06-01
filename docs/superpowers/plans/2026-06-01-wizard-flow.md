# Wizard Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the all-at-once clarify screen with a sequential wizard: one self-rewriting message that walks the user through type → (version) → level → age, then fires generation on the last tap.

**Architecture:** Add `wizard_step` to `SessionContext`. Replace `buildClarifyMessage` / `handleClarifyParam` / `handleClarifyConfirm` with `buildWizardMessage` / `handleWizardStep`. Callback data changes from `clr_*` to `wiz_*`. `handleVerbInput` and `handleTopicInput` stay unchanged.

**Tech Stack:** Deno, TypeScript, Supabase Edge Functions, Telegram Bot API (editMessageText for self-rewriting), Anthropic Claude API.

---

### Task 1: Add `wizard_step` to `SessionContext`

**Files:**
- Modify: `supabase/functions/english-bot/lib/types.ts`

- [ ] **Step 1: Add `wizard_step` field to `SessionContext`**

Find `SessionContext` interface and add the new field:

```typescript
export interface SessionContext {
  last_request?: string;
  current_assignment?: string;
  current_assignment_teacher?: string;
  cached_assignment_id?: string;
  invite_pending?: boolean;
  module_type?: ModuleType;
  params?: ClarifyingParams;
  wizard_step?: "type" | "version" | "level" | "age";
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/garva/english_bot && git add supabase/functions/english-bot/lib/types.ts && git commit -m "feat: add wizard_step to SessionContext"
```

---

### Task 2: Replace clarify UI with wizard (clarify.ts + request.ts together)

These two files are changed together because `request.ts` imports `buildClarifyMessage` from `clarify.ts` — changing the export name requires both files in the same commit.

**Files:**
- Modify: `supabase/functions/english-bot/handlers/clarify.ts`
- Modify: `supabase/functions/english-bot/handlers/request.ts`

- [ ] **Step 1: Replace `clarify.ts` entirely**

Write the full new file:

```typescript
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
```

- [ ] **Step 2: Update `request.ts` — use `buildWizardMessage` and set `wizard_step`**

Replace the entire file:

```typescript
import { sendMessage, answerCallbackQuery, editMessageText } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import { detectModule, extractParams, extractVerb } from "../lib/module_detect.ts";
import { buildWizardMessage } from "./clarify.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

// Handle free-form text in WAITING_REQUEST state: detect module, start wizard
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
    wizard_step: "type",
  });

  const { text, kb } = buildWizardMessage("type", moduleType, params);
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

- [ ] **Step 3: Commit both files together**

```bash
cd /Users/garva/english_bot && git add supabase/functions/english-bot/handlers/clarify.ts supabase/functions/english-bot/handlers/request.ts && git commit -m "feat: replace clarify UI with step-by-step wizard"
```

---

### Task 3: Simplify welcome message in start.ts

**Files:**
- Modify: `supabase/functions/english-bot/handlers/start.ts`

- [ ] **Step 1: Replace the WELCOME constant**

Find `const WELCOME = ...` and replace it with:

```typescript
const WELCOME = "Напиши тему задания:";
```

- [ ] **Step 2: Commit**

```bash
cd /Users/garva/english_bot && git add supabase/functions/english-bot/handlers/start.ts && git commit -m "feat: simplify welcome message to ask for topic only"
```

---

### Task 4: Update index.ts routing

**Files:**
- Modify: `supabase/functions/english-bot/index.ts`

- [ ] **Step 1: Update clarify imports**

Replace:
```typescript
import {
  handleClarifyParam,
  handleClarifyConfirm,
  handleTopicInput,
  handleVerbInput,
} from "./handlers/clarify.ts";
```

With:
```typescript
import {
  handleWizardStep,
  handleTopicInput,
  handleVerbInput,
} from "./handlers/clarify.ts";
```

- [ ] **Step 2: Replace callback routes**

Find this block inside `route`:
```typescript
    if (
      data.startsWith("clr_type_") ||
      data.startsWith("clr_level_") ||
      data.startsWith("clr_age_") ||
      data.startsWith("clr_ver_")
    ) {
      return handleClarifyParam(query);
    }
    if (data === "clr_confirm") return handleClarifyConfirm(query);
```

Replace with:
```typescript
    if (data.startsWith("wiz_")) return handleWizardStep(query);
```

- [ ] **Step 3: Commit**

```bash
cd /Users/garva/english_bot && git add supabase/functions/english-bot/index.ts && git commit -m "feat: route wiz_* callbacks to handleWizardStep"
```

---

### Task 5: Run tests, deploy, smoke test

**Files:** none (verification + deploy)

- [ ] **Step 1: Run test suite**

```bash
cd /Users/garva/english_bot && deno test supabase/functions/english-bot/lib/ --allow-env 2>&1
```

Expected: `21 passed | 0 failed`

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy english-bot --no-verify-jwt 2>&1
```

Expected: `Deployed Functions on project btlglelwxazdxfqdmcti: english-bot`

- [ ] **Step 3: Smoke test flows**

**Flow A — topic with auto-detected type:**
1. Send: `B2, бизнес, взрослый`
2. Expected: wizard step 1 — type buttons, "✓ Reading" pre-selected
3. Tap "Vocabulary" → step 2 — version buttons: "Без ответов" / "С ответами для учителя"
4. Tap "Без ответов" → step 3 — level buttons
5. Tap "B2" → step 4 — age buttons
6. Tap "взрослый" → "Генерирую задание..."

**Flow B — verb sentences:**
1. Send: `задание на глаголы must и have to, B1`
2. Expected: wizard step 1 — "✓ Глаголы (пред.)" pre-selected
3. Tap "✓ Глаголы (пред.)" → step 2 — level buttons (no version step)
4. Tap "B1" → step 3 — age buttons
5. Tap "подросток" → "Генерирую задание..." (verb was in topic, so no verb prompt)

**Flow C — verb sentences, no verb:**
1. Send: `задание на глаголы`
2. Tap through type/level/age → after age tap: "Какой глагол?"
3. Reply "should" → "Генерирую задание..."
