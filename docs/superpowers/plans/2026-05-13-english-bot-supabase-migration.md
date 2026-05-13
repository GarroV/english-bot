# English Bot — Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Telegram English homework bot from Python/polling to Deno/Edge Functions on a new Supabase project, adding multi-user support, invite-based access, and pgvector assignment caching.

**Architecture:** Single `english-bot` Edge Function handles all Telegram webhook events, routing by command or session state stored in Supabase. Assignment cache uses pgvector cosine similarity search via Supabase built-in AI embeddings (gte-small, no extra API key).

**Tech Stack:** Deno, Supabase Edge Functions, PostgreSQL + pgvector, Supabase AI (gte-small), `npm:@anthropic-ai/sdk`, `npm:pdf-lib`, Telegram Bot API (direct fetch calls), `jsr:@std/assert` for tests.

---

## File Map

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260513000000_init.sql` | 4 tables + pgvector + match function + indexes |
| `supabase/functions/english-bot/lib/types.ts` | Shared TypeScript types (no logic) |
| `supabase/functions/english-bot/lib/utils.ts` | Pure functions: makeFilename, splitIfLong, normalizeRequest, generateInviteCode |
| `supabase/functions/english-bot/lib/utils.test.ts` | Unit tests for utils |
| `supabase/functions/english-bot/lib/telegram.ts` | Telegram API calls: sendMessage, editMessageText, answerCallbackQuery, sendDocument, keyboard helper |
| `supabase/functions/english-bot/lib/db.ts` | All Supabase DB operations + embedding generation |
| `supabase/functions/english-bot/lib/claude.ts` | generateAssignment, applyEdit (same prompts as bot.py) |
| `supabase/functions/english-bot/lib/pdf.ts` | generatePdf via pdf-lib |
| `supabase/functions/english-bot/handlers/start.ts` | /start command: admin auto-reg, invite-code flow, already-registered flow |
| `supabase/functions/english-bot/handlers/request.ts` | WAITING_REQUEST state + change_request callback |
| `supabase/functions/english-bot/handlers/generate.ts` | confirm callback: cache lookup → CACHE_OFFER or generate; use_cached / generate_new callbacks |
| `supabase/functions/english-bot/handlers/edit.ts` | edit_assignment callback + EDITING state handler |
| `supabase/functions/english-bot/handlers/pdf_download.ts` | download_pdf callback |
| `supabase/functions/english-bot/handlers/admin.ts` | /invite and /users commands |
| `supabase/functions/english-bot/index.ts` | Deno.serve entry point, routes all updates |

---

## Task 1: Project scaffold

**Files:**
- Create: `supabase/functions/english-bot/` (directory tree)
- Create: `deno.json`

- [ ] **Step 1: Init Supabase in the project**

From `/Users/garva/english_bot`:
```bash
supabase init
```
Expected: creates `supabase/config.toml`. If it already exists, skip.

- [ ] **Step 2: Create the function directory tree**

```bash
mkdir -p supabase/functions/english-bot/lib
mkdir -p supabase/functions/english-bot/handlers
mkdir -p supabase/migrations
```

- [ ] **Step 3: Create deno.json for running tests**

Create `deno.json` at project root:
```json
{
  "tasks": {
    "test": "deno test --allow-all supabase/functions/english-bot/lib/utils.test.ts"
  }
}
```

- [ ] **Step 4: Commit scaffold**

```bash
git add supabase/ deno.json
git commit -m "chore: scaffold Supabase Edge Function structure"
```

---

## Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20260513000000_init.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260513000000_init.sql`:
```sql
-- Enable pgvector
create extension if not exists vector;

-- Users (white list + profiles)
create table eb_users (
  telegram_id  bigint primary key,
  username     text,
  name         text,
  invited_by   bigint references eb_users(telegram_id),
  created_at   timestamptz default now()
);

-- Conversation state
-- No FK to eb_users: unregistered users need REGISTERING state too
create table eb_sessions (
  telegram_id  bigint primary key,
  state        text not null,
  context      jsonb default '{}',
  updated_at   timestamptz default now()
);

-- Assignment cache + history
create table eb_assignments (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  bigint references eb_users(telegram_id),
  level        text,
  topic        text,
  age_group    text,
  request_text text,
  content      text,
  embedding    vector(512),
  created_at   timestamptz default now()
);

-- Invite codes (one-time use)
create table eb_invitations (
  code        text primary key,
  created_by  bigint references eb_users(telegram_id),
  used_by     bigint references eb_users(telegram_id),
  used_at     timestamptz,
  created_at  timestamptz default now()
);

-- Similarity search function
create or replace function match_assignments(
  query_embedding vector(512),
  match_threshold float,
  match_count int
)
returns table (
  id           uuid,
  telegram_id  bigint,
  level        text,
  topic        text,
  age_group    text,
  request_text text,
  content      text,
  created_at   timestamptz
)
language sql stable
as $$
  select
    id, telegram_id, level, topic, age_group, request_text, content, created_at
  from eb_assignments
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Index for vector search performance (tune lists= when row count grows)
create index on eb_assignments using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);
```

- [ ] **Step 2: Apply migration to new Supabase project**

First, link to the new project (create it in Supabase dashboard first):
```bash
supabase link --project-ref <your-new-project-ref>
```

Then push:
```bash
supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/
git commit -m "feat: add database schema for English bot"
```

---

## Task 3: Types

**Files:**
- Create: `supabase/functions/english-bot/lib/types.ts`

- [ ] **Step 1: Write types**

Create `supabase/functions/english-bot/lib/types.ts`:
```typescript
export type State =
  | "REGISTERING"
  | "WAITING_REQUEST"
  | "CONFIRMING"
  | "CACHE_OFFER"
  | "POST_GENERATION"
  | "EDITING";

export interface SessionContext {
  last_request?: string;
  current_assignment?: string;
  cached_assignment_id?: string;
  invite_pending?: boolean;
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
git commit -m "feat: add shared TypeScript types"
```

---

## Task 4: Utils + tests

**Files:**
- Create: `supabase/functions/english-bot/lib/utils.ts`
- Create: `supabase/functions/english-bot/lib/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/english-bot/lib/utils.test.ts`:
```typescript
import { assertEquals } from "jsr:@std/assert";
import { makeFilename, splitIfLong, normalizeRequest, generateInviteCode } from "./utils.ts";

Deno.test("makeFilename: extracts level and topic", () => {
  const text = "Level: A2 · Topic: Food and Restaurants · Age group: Teenager\n\nSome text";
  assertEquals(makeFilename(text), "A2_Food_and_Restaurants.pdf");
});

Deno.test("makeFilename: level only when no topic match", () => {
  const text = "Level: B1\nSome text";
  assertEquals(makeFilename(text), "B1.pdf");
});

Deno.test("makeFilename: falls back to homework", () => {
  assertEquals(makeFilename("plain text"), "homework.pdf");
});

Deno.test("splitIfLong: returns null second part when short", () => {
  const [first, second] = splitIfLong("Short text");
  assertEquals(first, "Short text");
  assertEquals(second, null);
});

Deno.test("splitIfLong: splits at newline when over limit", () => {
  const part1 = "a".repeat(3000);
  const part2 = "b".repeat(2000);
  const [first, second] = splitIfLong(part1 + "\n" + part2);
  assertEquals(second !== null, true);
  assertEquals(first + second, part1 + "\n" + part2);
});

Deno.test("normalizeRequest: lowercases and removes punctuation", () => {
  assertEquals(
    normalizeRequest("A2, Еда и Рестораны, Подросток!"),
    "a2 еда и рестораны подросток"
  );
});

Deno.test("generateInviteCode: returns 6-char uppercase alphanumeric", () => {
  const code = generateInviteCode();
  assertEquals(code.length, 6);
  assertEquals(code, code.toUpperCase());
  assertEquals(/^[A-Z0-9]{6}$/.test(code), true);
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
deno test supabase/functions/english-bot/lib/utils.test.ts
```

Expected: error — `./utils.ts` not found.

- [ ] **Step 3: Write implementation**

Create `supabase/functions/english-bot/lib/utils.ts`:
```typescript
export function makeFilename(text: string): string {
  const firstLine = text.split("\n")[0];
  const levelMatch = firstLine.match(/Level:\s*(\S+)/);
  const topicMatch = firstLine.match(/Topic:\s*([^·]+)/);
  const level = levelMatch ? levelMatch[1].trim() : "homework";
  const topic = topicMatch ? topicMatch[1].trim() : "";
  const topicSlug = topic.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return topicSlug ? `${level}_${topicSlug}.pdf` : `${level}.pdf`;
}

export function splitIfLong(
  text: string,
  limit = 4096
): [string, string | null] {
  if (text.length <= limit) return [text, null];
  const mid = text.lastIndexOf("\n", 4000);
  return [text.slice(0, mid), text.slice(mid)];
}

export function normalizeRequest(userInput: string): string {
  return userInput
    .toLowerCase()
    .replace(/[,\.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
deno test supabase/functions/english-bot/lib/utils.test.ts
```

Expected: `ok | 7 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/english-bot/lib/utils.ts supabase/functions/english-bot/lib/utils.test.ts
git commit -m "feat: add utils with tests"
```

---

## Task 5: Telegram client

**Files:**
- Create: `supabase/functions/english-bot/lib/telegram.ts`

- [ ] **Step 1: Write Telegram client**

Create `supabase/functions/english-bot/lib/telegram.ts`:
```typescript
import type { InlineKeyboard, InlineKeyboardButton } from "./types.ts";

const BASE = `https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}`;

async function call(method: string, body: object): Promise<void> {
  await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text && { text }),
  });
}

export async function sendDocument(
  chatId: number,
  filename: string,
  bytes: Uint8Array,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([bytes]), filename);
  if (caption) form.append("caption", caption);
  await fetch(`${BASE}/sendDocument`, { method: "POST", body: form });
}

// keyboard([["✅ Use this", "use_cached"], ["🔄 New", "generate_new"]])
// Each inner array is one button per row.
export function keyboard(rows: [string, string][][]): InlineKeyboard {
  return {
    inline_keyboard: rows.map((row) =>
      row.map(([text, callback_data]): InlineKeyboardButton => ({
        text,
        callback_data,
      }))
    ),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/telegram.ts
git commit -m "feat: add Telegram API client"
```

---

## Task 6: Database layer

**Files:**
- Create: `supabase/functions/english-bot/lib/db.ts`

- [ ] **Step 1: Write DB layer**

Create `supabase/functions/english-bot/lib/db.ts`:
```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import type { State, DbSession, DbUser, DbAssignment, SessionContext } from "./types.ts";
import { generateInviteCode } from "./utils.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Supabase.ai.Session is a global available only in the Deno Edge Runtime
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run(
        input: string,
        options: { mean_pool: boolean; normalize: boolean }
      ): Promise<{ data: Float32Array }>;
    };
  };
};

async function embed(text: string): Promise<number[]> {
  const session = new Supabase.ai.Session("gte-small");
  const result = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(result.data);
}

export async function isAllowed(telegramId: number): Promise<boolean> {
  const { data } = await supabase
    .from("eb_users")
    .select("telegram_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data !== null;
}

export async function registerUser(
  telegramId: number,
  username: string | undefined,
  name: string,
  invitedBy?: number
): Promise<void> {
  await supabase.from("eb_users").upsert({
    telegram_id: telegramId,
    username: username ?? null,
    name,
    invited_by: invitedBy ?? null,
  });
}

export async function getSession(telegramId: number): Promise<DbSession | null> {
  const { data } = await supabase
    .from("eb_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data as DbSession | null;
}

export async function setSession(
  telegramId: number,
  state: State,
  context: SessionContext = {}
): Promise<void> {
  await supabase.from("eb_sessions").upsert({
    telegram_id: telegramId,
    state,
    context,
    updated_at: new Date().toISOString(),
  });
}

export async function validateInvite(code: string): Promise<boolean> {
  const { data } = await supabase
    .from("eb_invitations")
    .select("code, used_by")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data !== null && data.used_by === null;
}

export async function getInviteCreator(code: string): Promise<number | null> {
  const { data } = await supabase
    .from("eb_invitations")
    .select("created_by")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return (data?.created_by as number) ?? null;
}

export async function useInvite(code: string, telegramId: number): Promise<void> {
  await supabase
    .from("eb_invitations")
    .update({ used_by: telegramId, used_at: new Date().toISOString() })
    .eq("code", code.toUpperCase());
}

export async function saveAssignment(params: {
  telegramId: number;
  level: string;
  topic: string;
  ageGroup: string;
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
    request_text: params.requestText,
    content: params.content,
    embedding,
  });
}

export async function findSimilarAssignment(
  level: string,
  topic: string,
  ageGroup: string
): Promise<DbAssignment | null> {
  const embeddingInput = `${level} ${topic} ${ageGroup}`;
  const embedding = await embed(embeddingInput);
  const { data } = await supabase.rpc("match_assignments", {
    query_embedding: embedding,
    match_threshold: 0.85,
    match_count: 1,
  });
  return (data?.[0] as DbAssignment) ?? null;
}

export async function getAssignment(id: string): Promise<DbAssignment | null> {
  const { data } = await supabase
    .from("eb_assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as DbAssignment | null;
}

export async function createInviteCode(createdBy: number): Promise<string> {
  const code = generateInviteCode();
  await supabase.from("eb_invitations").insert({ code, created_by: createdBy });
  return code;
}

export async function listUsers(): Promise<DbUser[]> {
  const { data } = await supabase
    .from("eb_users")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as DbUser[]) ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/db.ts
git commit -m "feat: add Supabase DB layer with pgvector similarity search"
```

---

## Task 7: Claude client

**Files:**
- Create: `supabase/functions/english-bot/lib/claude.ts`

- [ ] **Step 1: Write Claude client**

Create `supabase/functions/english-bot/lib/claude.ts`:
```typescript
import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_KEY") });

const GENERATION_PROMPT = `Ты опытный репетитор английского языка. Создай домашнее задание на основе запроса: {INPUT}

Структура задания:
0. Самая первая строка (до заголовка текста): Level: [уровень] · Topic: [тема на английском] · Age group: [возраст на английском]
1. Текст для чтения (150-200 слов) на английском, подходящий под уровень
2. Task 1 — Vocabulary (matching или выбор слов)
3. Task 2 — Reading: True/False (6 утверждений)
4. Task 3 — Reading: вопросы по тексту (5 вопросов, ответить полными предложениями)
5. Task 4 — Grammar (тема грамматики подходящая для уровня, 6 предложений)
6. Task 5 — Grammar (другой тип упражнения на ту же или смежную тему)
7. Task 6 — Vocabulary in context (выбор правильного слова)
8. Task 7 — Speaking (4-5 вопросов для подготовки к следующему уроку)
9. Task 8 — Creative writing optional (4-6 предложений, необязательное)

Требования:
- Все задания на английском
- Инструкции чёткие и понятные — ученик делает дома самостоятельно
- Задания интересные и разнообразные
- Уровень сложности строго соответствует запросу
- Текст обезличенный — никаких имён героев, никакого повествования от первого лица ("I travelled", "My trip"). Только нейтральный стиль: описание места, факты, диалоги без конкретного героя

Форматирование:
- Никаких заголовков типа "Homework Assignment" в начале
- Никаких разделителей --- между блоками
- Никаких фраз "Good luck" или похожих в конце
- Заголовки блоков просто: Task 1 · Vocabulary, Task 2 · Reading и т.д.`;

export async function generateAssignment(userInput: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: GENERATION_PROMPT.replace("{INPUT}", userInput),
    }],
  });
  return (message.content[0] as { text: string }).text;
}

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

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/lib/claude.ts
git commit -m "feat: add Claude client (same prompts as original bot.py)"
```

---

## Task 8: PDF generator

**Files:**
- Create: `supabase/functions/english-bot/lib/pdf.ts`

- [ ] **Step 1: Write PDF generator**

Create `supabase/functions/english-bot/lib/pdf.ts`:
```typescript
import { PDFDocument, StandardFonts } from "npm:pdf-lib";

export async function generatePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const fontSize = 11;
  const lineHeight = 14;
  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;
  const usableWidth = pageWidth - 2 * margin;

  // Word-wrap each line to fit usable width
  const wrapped: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") {
      wrapped.push("");
      continue;
    }
    const words = raw.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > usableWidth && current) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push(current);
  }

  // Paginate
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of wrapped) {
    if (y < margin + lineHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    if (line !== "") {
      page.drawText(line, { x: margin, y, font, size: fontSize });
    }
    y -= lineHeight;
  }

  return doc.save();
}
```

- [ ] **Step 2: Smoke-test locally**

```bash
deno eval "
import { generatePdf } from './supabase/functions/english-bot/lib/pdf.ts';
const bytes = await generatePdf('Level: A2 · Topic: Food · Age group: Teenager\n\nHello world.');
console.log('PDF bytes:', bytes.length, '(should be > 0)');
" --allow-net
```

Expected: `PDF bytes: <some number> (should be > 0)`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/english-bot/lib/pdf.ts
git commit -m "feat: add PDF generator using pdf-lib"
```

---

## Task 9: Start handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/start.ts`

- [ ] **Step 1: Write start handler**

Create `supabase/functions/english-bot/handlers/start.ts`:
```typescript
import { sendMessage } from "../lib/telegram.ts";
import {
  isAllowed,
  registerUser,
  setSession,
  validateInvite,
  useInvite,
  getInviteCreator,
} from "../lib/db.ts";
import type { TgMessage } from "../lib/types.ts";

const ADMIN_ID = Number(Deno.env.get("ADMIN_USER_ID")!);

const WELCOME =
  "Я генерирую домашние задания по английскому.\n\n" +
  "Напиши запрос в формате:\nуровень, тема, возраст\n\n" +
  "Например: A2, еда и рестораны, подросток";

export async function handleStart(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;

  // Admin bypasses invite requirement
  if (id === ADMIN_ID) {
    await registerUser(id, username, first_name);
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, `Добро пожаловать! ${WELCOME}`);
    return;
  }

  // Already registered
  if (await isAllowed(id)) {
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, WELCOME);
    return;
  }

  // New user — request invite code
  await setSession(id, "REGISTERING");
  await sendMessage(chatId, "Привет! Для доступа введи инвайт-код:");
}

export async function handleInviteCode(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;
  const code = message.text?.trim().toUpperCase() ?? "";

  if (!(await validateInvite(code))) {
    await sendMessage(chatId, "Неверный или уже использованный код. Попробуй ещё раз:");
    return;
  }

  const invitedBy = await getInviteCreator(code);
  await registerUser(id, username, first_name, invitedBy ?? undefined);
  await useInvite(code, id);
  await setSession(id, "WAITING_REQUEST");
  await sendMessage(chatId, `Доступ открыт! ${WELCOME}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/start.ts
git commit -m "feat: add start handler with invite-code registration"
```

---

## Task 10: Request handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/request.ts`

- [ ] **Step 1: Write request handler**

Create `supabase/functions/english-bot/handlers/request.ts`:
```typescript
import { sendMessage, editMessageText, answerCallbackQuery, keyboard } from "../lib/telegram.ts";
import { setSession } from "../lib/db.ts";
import type { TgMessage, TgCallbackQuery } from "../lib/types.ts";

export async function handleRequest(message: TgMessage): Promise<void> {
  const userInput = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const userId = message.from.id;

  await setSession(userId, "CONFIRMING", { last_request: userInput });

  const kb = keyboard([
    [["✅ Генерировать", "confirm"]],
    [["✏️ Изменить запрос", "change_request"]],
  ]);

  await sendMessage(
    chatId,
    `Запрос:\n*${userInput}*\n\nУбедитесь, что указан уровень (A1/A2/B1/B2/C1), тема и возраст ученика.\n\nВсё верно?`,
    kb
  );
}

export async function handleChangeRequest(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "WAITING_REQUEST");
  await editMessageText(
    query.message.chat.id,
    query.message.message_id,
    "Напиши новый запрос (уровень, тема, возраст):"
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/request.ts
git commit -m "feat: add request + confirm handlers"
```

---

## Task 11: Generate handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/generate.ts`

- [ ] **Step 1: Write generate handler**

Create `supabase/functions/english-bot/handlers/generate.ts`:
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
  findSimilarAssignment,
  getAssignment,
} from "../lib/db.ts";
import { generateAssignment } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

// Parses "A2, еда и рестораны, подросток" → { level, topic, ageGroup }
function parseRequest(input: string): { level: string; topic: string; ageGroup: string } {
  const parts = input.split(",").map((s) => s.trim());
  return {
    level: parts[0]?.toUpperCase() ?? "",
    topic: parts[1] ?? "",
    ageGroup: parts[2] ?? "",
  };
}

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/generate.ts
git commit -m "feat: add generate handler with cache lookup"
```

---

## Task 12: Edit handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/edit.ts`

- [ ] **Step 1: Write edit handler**

Create `supabase/functions/english-bot/handlers/edit.ts`:
```typescript
import { sendMessage, answerCallbackQuery, keyboard } from "../lib/telegram.ts";
import { getSession, setSession } from "../lib/db.ts";
import { applyEdit } from "../lib/claude.ts";
import { splitIfLong } from "../lib/utils.ts";
import type { TgCallbackQuery, TgMessage } from "../lib/types.ts";

export async function handleEditAssignment(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id);
  await setSession(query.from.id, "EDITING");
  await sendMessage(query.message.chat.id, "Что именно поправить? Опиши изменения:");
}

export async function handleApplyEdit(message: TgMessage): Promise<void> {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const editRequest = message.text?.trim() ?? "";

  const session = await getSession(userId);
  const original = session?.context.current_assignment ?? "";

  await sendMessage(chatId, "Вношу правки...");

  const edited = await applyEdit(original, editRequest);

  // Save edited version to session only — not to the shared assignments cache
  await setSession(userId, "POST_GENERATION", { current_assignment: edited });

  const kb = keyboard([
    [["✏️ Поправить что-то", "edit_assignment"]],
    [["📄 Скачать PDF", "download_pdf"]],
  ]);

  const [first, second] = splitIfLong(edited);
  if (second !== null) {
    await sendMessage(chatId, first);
    await sendMessage(chatId, second, kb);
  } else {
    await sendMessage(chatId, first, kb);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/edit.ts
git commit -m "feat: add edit handler (saves to session, not cache)"
```

---

## Task 13: PDF download handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/pdf_download.ts`

- [ ] **Step 1: Write PDF download handler**

Create `supabase/functions/english-bot/handlers/pdf_download.ts`:
```typescript
import { answerCallbackQuery, sendDocument, sendMessage } from "../lib/telegram.ts";
import { getSession } from "../lib/db.ts";
import { generatePdf } from "../lib/pdf.ts";
import { makeFilename } from "../lib/utils.ts";
import type { TgCallbackQuery } from "../lib/types.ts";

export async function handleDownloadPdf(query: TgCallbackQuery): Promise<void> {
  await answerCallbackQuery(query.id, "Генерирую PDF...");

  const session = await getSession(query.from.id);
  const text = session?.context.current_assignment ?? "";

  try {
    const bytes = await generatePdf(text);
    const filename = makeFilename(text);
    await sendDocument(query.message.chat.id, filename, bytes, "Готово!");
  } catch (e) {
    await sendMessage(query.message.chat.id, `Ошибка при создании PDF: ${e}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/pdf_download.ts
git commit -m "feat: add PDF download handler"
```

---

## Task 14: Admin handler

**Files:**
- Create: `supabase/functions/english-bot/handlers/admin.ts`

- [ ] **Step 1: Write admin handler**

Create `supabase/functions/english-bot/handlers/admin.ts`:
```typescript
import { sendMessage } from "../lib/telegram.ts";
import { createInviteCode, listUsers } from "../lib/db.ts";
import type { TgMessage } from "../lib/types.ts";

const ADMIN_ID = Number(Deno.env.get("ADMIN_USER_ID")!);

function isAdmin(userId: number): boolean {
  return userId === ADMIN_ID;
}

export async function handleInvite(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const code = await createInviteCode(message.from.id);
  await sendMessage(
    message.chat.id,
    `Инвайт-код: \`${code}\`\n\nОднократный — передай пользователю. Они вводят его после /start.`
  );
}

export async function handleUsers(message: TgMessage): Promise<void> {
  if (!isAdmin(message.from.id)) {
    await sendMessage(message.chat.id, "Нет доступа.");
    return;
  }
  const users = await listUsers();
  if (users.length === 0) {
    await sendMessage(message.chat.id, "Нет зарегистрированных пользователей.");
    return;
  }
  const lines = users.map(
    (u) => `• ${u.name}${u.username ? ` (@${u.username})` : ""} — ${u.telegram_id}`
  );
  await sendMessage(message.chat.id, `Пользователи (${users.length}):\n\n${lines.join("\n")}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/handlers/admin.ts
git commit -m "feat: add admin handler (/invite, /users)"
```

---

## Task 15: Main router

**Files:**
- Create: `supabase/functions/english-bot/index.ts`

- [ ] **Step 1: Write router**

Create `supabase/functions/english-bot/index.ts`:
```typescript
import { handleStart, handleInviteCode } from "./handlers/start.ts";
import { handleRequest, handleChangeRequest } from "./handlers/request.ts";
import {
  handleConfirm,
  handleUseCached,
  handleGenerateNew,
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

  try {
    const update: TgUpdate = await req.json();
    await route(update);
  } catch (e) {
    console.error("Unhandled error:", e);
  }

  // Always return 200 so Telegram doesn't retry
  return new Response("OK", { status: 200 });
});

async function route(update: TgUpdate): Promise<void> {
  // Callback query routing (button taps)
  if (update.callback_query) {
    const query = update.callback_query;
    if (!(await isAllowed(query.from.id))) return;

    const { data } = query;
    if (data === "confirm") return handleConfirm(query);
    if (data === "change_request") return handleChangeRequest(query);
    if (data === "use_cached") return handleUseCached(query);
    if (data === "generate_new") return handleGenerateNew(query);
    if (data === "edit_assignment") return handleEditAssignment(query);
    if (data === "download_pdf") return handleDownloadPdf(query);
    return;
  }

  // Message routing
  if (update.message) {
    const message = update.message;
    const text = message.text ?? "";
    const userId = message.from.id;
    const chatId = message.chat.id;

    // Commands always routed regardless of state
    if (text === "/start") return handleStart(message);
    if (text === "/invite") return handleInvite(message);
    if (text === "/users") return handleUsers(message);

    // Non-command messages: check session first
    const session = await getSession(userId);

    // Unregistered user submitting invite code
    if (!(await isAllowed(userId))) {
      if (session?.state === "REGISTERING") {
        return handleInviteCode(message);
      }
      await sendMessage(chatId, "Привет! Напиши /start чтобы начать.");
      return;
    }

    // Registered user: route by session state
    const state = session?.state ?? "WAITING_REQUEST";
    if (state === "WAITING_REQUEST") return handleRequest(message);
    if (state === "EDITING") return handleApplyEdit(message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/english-bot/index.ts
git commit -m "feat: add main router (index.ts)"
```

---

## Task 16: Set secrets, deploy, register webhook

- [ ] **Step 1: Set Edge Function secrets**

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN=<value from .env> \
  ANTHROPIC_KEY=<value from .env> \
  ADMIN_USER_ID=<your telegram id>
```

To find your Telegram ID: message `@userinfobot` in Telegram.

- [ ] **Step 2: Deploy the function**

```bash
supabase functions deploy english-bot --no-verify-jwt
```

Expected output: `Deployed Function english-bot` with a URL like:
`https://<project-ref>.supabase.co/functions/v1/english-bot`

- [ ] **Step 3: Register webhook with Telegram**

```bash
curl -s -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<project-ref>.supabase.co/functions/v1/english-bot"}'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

- [ ] **Step 4: Verify webhook is set**

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo" | python3 -m json.tool
```

Expected: `"url"` matches your function URL, `"pending_update_count": 0`.

- [ ] **Step 5: Smoke test**

1. Send `/start` to the bot in Telegram
2. Admin should see the welcome message (auto-registered)
3. Send `/invite` — should get a 6-char code
4. Open a second Telegram account, send `/start`, enter the invite code — should be registered
5. From the second account, send `A2, food, teenager` → confirm → generate → verify assignment appears
6. Tap "Download PDF" → verify PDF file arrives
7. Tap "Edit something" → send `make it shorter` → verify edited assignment appears

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: deployment verified"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Always-on: Edge Function runs without `run.sh`
- [x] Multi-user: eb_users + invite system
- [x] Invite-based access: handleInviteCode + validateInvite
- [x] Assignment cache: findSimilarAssignment + CACHE_OFFER state
- [x] Hybrid edit: edited version saved to session, not cache (handleApplyEdit)
- [x] Admin auto-registration: ADMIN_ID bypass in handleStart
- [x] PDF: generatePdf via pdf-lib, makeFilename from first line
- [x] Same Claude prompts: GENERATION_PROMPT in claude.ts is identical to bot.py
- [x] Message splitting: splitIfLong used in sendAssignment and handleApplyEdit
- [x] Webhook mode: Deno.serve in index.ts replaces polling

**Type consistency:**
- `SessionContext` used in setSession/getSession throughout ✓
- `DbAssignment.content` used in sendAssignment ✓
- `TgCallbackQuery.message.chat.id` used correctly in all handlers ✓
- `parseRequest` defined in generate.ts and used only there ✓
- `keyboard()` exported from telegram.ts and imported in all handlers that need it ✓
