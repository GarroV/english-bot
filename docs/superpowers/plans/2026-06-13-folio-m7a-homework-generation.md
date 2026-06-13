# Folio M7a — Homework Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A homework-generation window in the Folio web (`/[locale]/homework`): generate a task → preview → save as a template, backed by a generation engine shared with the bot.

**Architecture:** Move the bot's generation code to `supabase/functions/_shared/generate.ts` (single source); the bot re-exports it (no handler changes); a secret-gated `folio-generate` Edge Function exposes it over HTTP; Folio calls it from a server action. Generated tasks save to `folio_homework_templates` (workspace RLS).

**Tech Stack:** Deno (Edge Functions, `npm:@anthropic-ai/sdk`), Next.js 16 (Server Actions), zod 4, shadcn/ui, next-intl 4, Supabase.

**Spec:** `docs/superpowers/specs/2026-06-13-folio-m7a-homework-generation-design.md`

---

## File Structure

- `supabase/functions/_shared/generate.ts` — moved generation engine (prompts + generateModuleContent/teacherGuide/applyEdit). NEW (from `english-bot/lib/claude.ts`)
- `supabase/functions/english-bot/lib/claude.ts` — thin re-export from `_shared`. MODIFY
- `supabase/functions/folio-generate/index.ts` — secret-gated HTTP wrapper. NEW
- `supabase/migrations/<ts>_folio_homework_templates.sql` — table + RLS. NEW
- `folio/src/lib/homework/schema.ts` — zod `homeworkInputSchema` + `MODULE_TYPES` + `HomeworkInput`. NEW
- `folio/src/lib/homework/generate.ts` — `callGenerate` (server fetch to folio-generate). NEW
- `folio/src/lib/homework/queries.ts` — `listTemplates`, `TemplateRow`. NEW
- `folio/src/lib/homework/actions.ts` — `generateHomework`, `saveTemplate`. NEW
- `folio/src/lib/homework/__tests__/schema.test.ts` — vitest. NEW
- `folio/src/app/[locale]/(app)/homework/page.tsx` — server page. NEW
- `folio/src/app/[locale]/(app)/homework/HomeworkGenerator.tsx` — client form. NEW
- `folio/src/app/[locale]/(app)/AppSidebar.tsx` — add "Домашки" nav. MODIFY
- `folio/messages/{ru,en}.json` — `Homework` namespace + `Nav.homework`. MODIFY
- `folio/.env.local` — `FOLIO_GENERATE_URL`, `FOLIO_GENERATE_SECRET`. MODIFY (not committed)
- `folio/.env.example` — document the two vars. MODIFY
- `Folio/docs/*` + english-bot `docs/*` — DoD.

Conventions: TS strict, no `any` without `// reason:`. `@/*` → `folio/src/*`. Commit per task; `Folio/...` case for app files; verify `git status` after. Work on `main`. Bot/function changes → commit, push, deploy.

---

### Task 1: Move generation to `_shared/generate.ts`; bot re-exports

**Files:** Create `supabase/functions/_shared/generate.ts`; Modify `supabase/functions/english-bot/lib/claude.ts`.

- [ ] **Step 1: Create `_shared/generate.ts`** — copy the FULL current contents of `supabase/functions/english-bot/lib/claude.ts` into the new file VERBATIM, then change only its types import line from:
```ts
import type { ModuleType, ClarifyingParams } from "./types.ts";
```
to:
```ts
import type { ModuleType, ClarifyingParams } from "../english-bot/lib/types.ts";
```
(Everything else — the `Anthropic` client on `ANTHROPIC_KEY`, all prompt constants, `buildPrompt`, `generateModuleContent`, `generateTeacherGuide`, `applyEdit` — is unchanged.)

- [ ] **Step 2: Replace `english-bot/lib/claude.ts` entirely** with a thin re-export:
```ts
// Generation engine lives in the shared module so the bot and Folio (folio-generate)
// run the identical prompts/logic. See supabase/functions/_shared/generate.ts.
export { generateModuleContent, generateTeacherGuide, applyEdit } from "../../_shared/generate.ts";
```

- [ ] **Step 3: Type-check the bot** — `deno check supabase/functions/english-bot/index.ts`
Expected: the pre-existing `edit.ts`/`telegram.ts` Blob warnings may remain, but NO new errors about claude/_shared/generate imports.

- [ ] **Step 4: Run bot tests** — `deno test supabase/functions/english-bot/lib/ --allow-env`
Expected: all pass (unchanged).

- [ ] **Step 5: Commit, push, deploy, smoke**
```bash
git add supabase/functions/_shared/generate.ts supabase/functions/english-bot/lib/claude.ts
git commit -m "refactor(bot): move generation engine to _shared/generate.ts (shared with Folio)"
git push
supabase functions deploy english-bot --no-verify-jwt
```
Then smoke: in Telegram, `/start` → generate one task → confirms the bot still generates. (If broken, fix before continuing — this touches live generation.)

---

### Task 2: `folio-generate` Edge Function

**Files:** Create `supabase/functions/folio-generate/index.ts`.

- [ ] **Step 1: Implement**
```ts
import { generateModuleContent } from "../_shared/generate.ts";

const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Shared generation engine over HTTP for the Folio web. Secret-gated; reuses ANTHROPIC_KEY.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (req.headers.get("x-folio-secret") !== Deno.env.get("FOLIO_GENERATE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const { moduleType, level, ageGroup, topic, verb } = await req.json();
    if (!MODULE_TYPES.includes(moduleType) || typeof topic !== "string" || !topic.trim()) {
      return json({ error: "bad request" }, 400);
    }
    const content = await generateModuleContent(
      moduleType,
      { level, ageGroup, version: "student", targetVerb: verb },
      topic,
    );
    return json({ content });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "generation failed" }, 500);
  }
});
```

- [ ] **Step 2: Set the secret + deploy** (controller runs these)
```bash
# generate a random secret and set it on Supabase
supabase secrets set FOLIO_GENERATE_SECRET="<random-hex>"
supabase functions deploy folio-generate --no-verify-jwt
```

- [ ] **Step 3: Curl test**
```bash
# wrong/no secret -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/folio-generate" -H "Content-Type: application/json" -d '{"moduleType":"VOCABULARY_MODULE","topic":"travel","level":"B1","ageGroup":"adult"}'
# with secret -> 200 + {content}
curl -s -X POST "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/folio-generate" -H "Content-Type: application/json" -H "x-folio-secret: <random-hex>" -d '{"moduleType":"VOCABULARY_MODULE","topic":"travel","level":"B1","ageGroup":"adult"}' | head -c 200
```
Expected: 401 without secret; JSON with a `content` string with it.

- [ ] **Step 4: Commit + push**
```bash
git add supabase/functions/folio-generate/index.ts
git commit -m "feat(folio): folio-generate Edge Function (secret-gated shared generation)"
git push
```

---

### Task 3: Env wiring (Folio)

**Files:** Modify `folio/.env.local` (not committed), `folio/.env.example`.

- [ ] **Step 1: `.env.local`** — append:
```bash
FOLIO_GENERATE_URL=https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/folio-generate
FOLIO_GENERATE_SECRET=<the same random-hex from Task 2>
```
- [ ] **Step 2: `.env.example`** — append (placeholders):
```bash
# Shared generation Edge Function (folio-generate)
FOLIO_GENERATE_URL=https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/folio-generate
FOLIO_GENERATE_SECRET=
```
- [ ] **Step 3: Commit the example**
```bash
git add folio/.env.example
git commit -m "chore(folio): env for folio-generate (url + secret)"
```

---

### Task 4: zod schema (TDD)

**Files:** Create `folio/src/lib/homework/schema.ts`, `folio/src/lib/homework/__tests__/schema.test.ts`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { homeworkInputSchema } from "../schema";

const base = { moduleType: "READING_MODULE" as const, topic: "London transport", level: "B1", ageGroup: "adult" };

describe("homeworkInputSchema", () => {
  it("accepts a valid reading input", () => {
    expect(homeworkInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects empty topic", () => {
    expect(homeworkInputSchema.safeParse({ ...base, topic: "  " }).success).toBe(false);
  });
  it("rejects unknown module type", () => {
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "ESSAY" }).success).toBe(false);
  });
  it("requires verb for VERB_SENTENCES", () => {
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "VERB_SENTENCES" }).success).toBe(false);
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "VERB_SENTENCES", verb: "must / have to" }).success).toBe(true);
  });
});
```
- [ ] **Step 2: Run → FAIL** — `cd folio && npm test`.
- [ ] **Step 3: Implement `schema.ts`**
```ts
import { z } from "zod";

export const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
] as const;

export const homeworkInputSchema = z
  .object({
    moduleType: z.enum(MODULE_TYPES),
    topic: z.string().trim().min(1),
    level: z.string().trim().min(1),
    ageGroup: z.string().trim().min(1),
    verb: z.string().trim().optional(),
  })
  .refine((v) => v.moduleType !== "VERB_SENTENCES" || !!v.verb, {
    message: "verb required for VERB_SENTENCES",
    path: ["verb"],
  });

export type HomeworkInput = z.infer<typeof homeworkInputSchema>;
```
- [ ] **Step 4: Run → PASS** — `npm test`.
- [ ] **Step 5: Commit**
```bash
git add Folio/src/lib/homework/schema.ts Folio/src/lib/homework/__tests__/schema.test.ts
git commit -m "feat(folio): homework input schema with tests"
```

---

### Task 5: generate.ts (server fetch)

**Files:** Create `folio/src/lib/homework/generate.ts`.

- [ ] **Step 1: Implement**
```ts
import type { HomeworkInput } from "./schema";

// Server-only: calls the shared generation Edge Function (secret in a header).
export async function callGenerate(input: HomeworkInput): Promise<string> {
  const res = await fetch(process.env.FOLIO_GENERATE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
    body: JSON.stringify({
      moduleType: input.moduleType,
      level: input.level,
      ageGroup: input.ageGroup,
      topic: input.topic,
      verb: input.verb,
    }),
  });
  if (!res.ok) throw new Error(`folio-generate ${res.status}`);
  const data = (await res.json()) as { content?: string };
  if (!data.content) throw new Error("empty generation");
  return data.content;
}
```
- [ ] **Step 2: tsc** — `cd folio && npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/homework/generate.ts
git commit -m "feat(folio): callGenerate (server fetch to folio-generate)"
```

---

### Task 6: queries + migration

**Files:** Create `supabase/migrations/<ts>_folio_homework_templates.sql`; Create `folio/src/lib/homework/queries.ts`.

- [ ] **Step 1: Migration**
```sql
-- Folio M7a: generated homework templates (content cache). Workspace-scoped RLS.
create table folio_homework_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  module_type  text not null check (module_type in
    ('READING_MODULE','VOCABULARY_MODULE','TRANSLATION_TEXTS','TRANSLATION_SENTENCES','VERB_SENTENCES')),
  level        text,
  age_group    text,
  topic        text not null,
  content      text not null,
  source       text not null default 'web' check (source in ('web','bot')),
  created_by   uuid references folio_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index folio_homework_templates_ws_idx on folio_homework_templates (workspace_id);
alter table folio_homework_templates enable row level security;
create policy "workspace_isolation" on folio_homework_templates
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());
```
- [ ] **Step 2: Apply** — `supabase db push` (or MCP `apply_migration`; rename local file to the recorded version).
- [ ] **Step 3: Verify** — `supabase db query --linked "select column_name from information_schema.columns where table_name='folio_homework_templates' order by ordinal_position"`.
- [ ] **Step 4: Implement `queries.ts`**
```ts
import { createClient } from "@/lib/supabase/server";

export interface TemplateRow {
  id: string;
  module_type: string;
  level: string | null;
  age_group: string | null;
  topic: string;
  content: string;
  created_at: string;
}

// Saved templates for the caller's workspace (RLS-scoped), newest first.
export async function listTemplates(): Promise<TemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_templates")
    .select("id, module_type, level, age_group, topic, content, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTemplates failed: ${error.message}`);
  return (data as TemplateRow[]) ?? [];
}
```
- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/*_folio_homework_templates.sql Folio/src/lib/homework/queries.ts
git commit -m "feat(db,folio): folio_homework_templates table + listTemplates"
```

---

### Task 7: server actions

**Files:** Create `folio/src/lib/homework/actions.ts`.

- [ ] **Step 1: Implement**
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { homeworkInputSchema, type HomeworkInput } from "./schema";
import { callGenerate } from "./generate";

export type GenResult = { ok: true; content: string } | { ok: false; error: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

// Generate (preview only, not persisted). Auth-gated so anon can't burn tokens.
export async function generateHomework(input: HomeworkInput): Promise<GenResult> {
  const parsed = homeworkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  try {
    const content = await callGenerate(parsed.data);
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generation failed" };
  }
}

// Persist a previewed result as a template (workspace + author from session).
export async function saveTemplate(input: HomeworkInput, content: string): Promise<SaveResult> {
  const parsed = homeworkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  if (!content.trim()) return { ok: false, error: "empty content" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_homework_templates").insert({
    workspace_id: workspaceId,
    module_type: v.moduleType,
    level: v.level,
    age_group: v.ageGroup,
    topic: v.topic,
    content,
    source: "web",
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/homework/actions.ts
git commit -m "feat(folio): homework actions (generate preview + save template)"
```

---

### Task 8: i18n + sidebar nav

**Files:** Modify `folio/messages/{ru,en}.json`, `folio/src/app/[locale]/(app)/AppSidebar.tsx`.

- [ ] **Step 1: `ru.json` add `Homework` namespace**
```json
"Homework": {
  "title": "Домашки",
  "type": "Тип задания",
  "topic": "Тема",
  "level": "Уровень",
  "age": "Аудитория",
  "verb": "Глагол",
  "generate": "Сгенерировать",
  "generating": "Генерирую…",
  "result": "Результат",
  "saveTemplate": "Сохранить шаблон",
  "saved": "Шаблон сохранён",
  "saveError": "Не удалось",
  "empty": "Шаблонов пока нет",
  "templates": "Шаблоны",
  "typeReading": "Reading",
  "typeVocabulary": "Vocabulary",
  "typeTranslationTexts": "Перевод (тексты)",
  "typeTranslationSentences": "Перевод (предложения)",
  "typeVerb": "Глаголы",
  "ageTeen": "Подросток",
  "ageYoung": "Молодой взрослый",
  "ageAdult": "Взрослый"
}
```
- [ ] **Step 2: `en.json` same keys** (English): title "Homework", type "Task type", topic "Topic", level "Level", age "Audience", verb "Verb", generate "Generate", generating "Generating…", result "Result", saveTemplate "Save template", saved "Template saved", saveError "Failed", empty "No templates yet", templates "Templates", typeReading "Reading", typeVocabulary "Vocabulary", typeTranslationTexts "Translation (texts)", typeTranslationSentences "Translation (sentences)", typeVerb "Verbs", ageTeen "Teen", ageYoung "Young adult", ageAdult "Adult".
- [ ] **Step 3: Nav** — add `"homework"` to `Nav` (ru `"Домашки"`, en `"Homework"`) and the item to `AppSidebar` NAV (read it first), placed after schedule:
```ts
const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/schedule", key: "schedule" },
  { href: "/students", key: "students" },
  { href: "/homework", key: "homework" },
] as const;
```
- [ ] **Step 4: Build** — `cd folio && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add Folio/messages/ru.json Folio/messages/en.json "Folio/src/app/[locale]/(app)/AppSidebar.tsx"
git commit -m "feat(folio): Homework i18n + sidebar nav"
```

---

### Task 9: HomeworkGenerator (client)

**Files:** Create `folio/src/app/[locale]/(app)/homework/HomeworkGenerator.tsx`.

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateHomework, saveTemplate } from "@/lib/homework/actions";
import { MODULE_TYPES, type HomeworkInput } from "@/lib/homework/schema";

interface Labels {
  type: string; topic: string; level: string; age: string; verb: string;
  generate: string; generating: string; result: string; saveTemplate: string;
  saved: string; saveError: string;
  typeReading: string; typeVocabulary: string; typeTranslationTexts: string;
  typeTranslationSentences: string; typeVerb: string;
  ageTeen: string; ageYoung: string; ageAdult: string;
}

const LEVELS = ["A2", "B1", "B2", "C1", "C2"];

export function HomeworkGenerator({ labels }: { labels: Labels }) {
  const router = useRouter();
  const typeLabels: Record<(typeof MODULE_TYPES)[number], string> = {
    READING_MODULE: labels.typeReading,
    VOCABULARY_MODULE: labels.typeVocabulary,
    TRANSLATION_TEXTS: labels.typeTranslationTexts,
    TRANSLATION_SENTENCES: labels.typeTranslationSentences,
    VERB_SENTENCES: labels.typeVerb,
  };
  const ages = [
    { v: "teen", label: labels.ageTeen },
    { v: "young_adult", label: labels.ageYoung },
    { v: "adult", label: labels.ageAdult },
  ];

  const [moduleType, setModuleType] = useState<(typeof MODULE_TYPES)[number]>("READING_MODULE");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B1");
  const [ageGroup, setAgeGroup] = useState("adult");
  const [verb, setVerb] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }

  const selectCls = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  async function onGenerate() {
    if (!topic.trim()) { toast.error(labels.saveError); return; }
    setPending(true);
    setContent("");
    try {
      const res = await generateHomework(currentInput());
      if (res.ok) setContent(res.content);
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function onSave() {
    setPending(true);
    try {
      const res = await saveTemplate(currentInput(), content);
      if (res.ok) { toast.success(labels.saved); setContent(""); setTopic(""); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-type">{labels.type}</Label>
          <select id="hw-type" className={selectCls} value={moduleType}
            onChange={(e) => setModuleType(e.target.value as (typeof MODULE_TYPES)[number])}>
            {MODULE_TYPES.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-topic">{labels.topic}</Label>
          <Input id="hw-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-level">{labels.level}</Label>
          <select id="hw-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-age">{labels.age}</Label>
          <select id="hw-age" className={selectCls} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {ages.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </div>
        {moduleType === "VERB_SENTENCES" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="hw-verb">{labels.verb}</Label>
            <Input id="hw-verb" value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="must / have to" />
          </div>
        )}
      </div>

      <div>
        <Button onClick={onGenerate} disabled={pending || !topic.trim()}>
          {pending && !content ? labels.generating : labels.generate}
        </Button>
      </div>

      {content && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">{labels.result}</span>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-4 font-sans text-sm">
            {content}
          </pre>
          <div>
            <Button onClick={onSave} disabled={pending}>{labels.saveTemplate}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/homework/HomeworkGenerator.tsx"
git commit -m "feat(folio): HomeworkGenerator form (generate → preview → save)"
```

---

### Task 10: homework page (server)

**Files:** Create `folio/src/app/[locale]/(app)/homework/page.tsx`.

- [ ] **Step 1: Implement**
```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/homework/queries";
import { HomeworkGenerator } from "./HomeworkGenerator";

const TYPE_KEY: Record<string, string> = {
  READING_MODULE: "typeReading",
  VOCABULARY_MODULE: "typeVocabulary",
  TRANSLATION_TEXTS: "typeTranslationTexts",
  TRANSLATION_SENTENCES: "typeTranslationSentences",
  VERB_SENTENCES: "typeVerb",
};

export default async function HomeworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const templates = await listTemplates();
  const t = await getTranslations("Homework");
  const labels = {
    type: t("type"), topic: t("topic"), level: t("level"), age: t("age"), verb: t("verb"),
    generate: t("generate"), generating: t("generating"), result: t("result"),
    saveTemplate: t("saveTemplate"), saved: t("saved"), saveError: t("saveError"),
    typeReading: t("typeReading"), typeVocabulary: t("typeVocabulary"),
    typeTranslationTexts: t("typeTranslationTexts"), typeTranslationSentences: t("typeTranslationSentences"),
    typeVerb: t("typeVerb"), ageTeen: t("ageTeen"), ageYoung: t("ageYoung"), ageAdult: t("ageAdult"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <HomeworkGenerator labels={labels} />

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t("templates")}</h2>
        {templates.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{tpl.topic}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(TYPE_KEY[tpl.module_type] ?? "typeReading")}{tpl.level ? ` · ${tpl.level}` : ""} · {new Date(tpl.created_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```
- [ ] **Step 2: Build** — `cd folio && npm run build`. Expected: `/[locale]/homework` registered.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/homework/page.tsx"
git commit -m "feat(folio): homework page (generator + templates list)"
```

---

### Task 11: Verification

- [ ] **Step 1: Full check** — `cd folio && npx tsc --noEmit && npm test && npm run build`. All pass; `/[locale]/homework` registered.
- [ ] **Step 2: RLS (SQL)** — `select policyname, cmd from pg_policies where tablename='folio_homework_templates'` → `workspace_isolation`/ALL.
- [ ] **Step 3: Smoke** — `npm run dev`, log in, open `/ru/homework`: pick Vocabulary, topic "travel", B1, adult → "Сгенерировать" → text appears (~10-30s) → "Сохранить шаблон" → toast + it appears in the templates list. Try VERB_SENTENCES without a verb → blocked (saveError) until a verb is entered. Verify a `folio_homework_templates` row exists.
- [ ] **Step 4:** Note results; fix any failure before docs.

---

### Task 12: Documentation (DoD)

**Files:** `Folio/docs/{DATA_MODEL,ARCHITECTURE,ROADMAP}.md`, english-bot `docs/{CHANGELOG,BOT}.md`.

- [ ] **Step 1: `DATA_MODEL.md`** — add `folio_homework_templates ✅` + migration entry; note the old `homework_templates` draft is partially realized (this slice: content cache + source).
- [ ] **Step 2: `ARCHITECTURE.md`** — add "Homework generation (M7a)": shared `_shared/generate.ts` engine (used by bot import + `folio-generate` HTTP), web `lib/homework/` + `(app)/homework`, secret-gated function, web↔bot parity ([[project-web-bot-parity]]).
- [ ] **Step 3: `ROADMAP.md`** — under M7 check off: общий движок генерации, форма генерации в веб-Folio, сохранение шаблона. Leave assignment/delivery/bot-write unchecked.
- [ ] **Step 4: english-bot `docs/CHANGELOG.md`** (dated entry) + `docs/BOT.md` — generation engine moved to `supabase/functions/_shared/generate.ts`; `lib/claude.ts` re-exports it; new `folio-generate` function shares it.
- [ ] **Step 5: Commit + push**
```bash
git add Folio/docs docs/CHANGELOG.md docs/BOT.md
git commit -m "docs(folio): document M7a homework generation (shared engine, templates)"
git push
```

---

## Self-Review

**Spec coverage:**
- Shared `_shared/generate.ts` + bot re-export → Task 1. ✓
- `folio-generate` Edge Function (secret-gated) → Task 2; env → Task 3. ✓
- `folio_homework_templates` + RLS → Task 6. ✓
- Web generation form → preview → save + list → Tasks 4,5,7,9,10. ✓
- zod (+ verb refine) → Task 4. ✓
- Sidebar nav + i18n → Task 8. ✓
- workspace_id/created_by server-derived → Task 7. ✓
- Tests + RLS + bot smoke → Tasks 1,4,11. ✓
- Docs incl. bot → Task 12. ✓
- Deferred (assignment/delivery/teacher/PDF/Template-Editor/streaming) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` (Task 6) and `<random-hex>` (Tasks 2–3) are explicit substitutions with instructions. No vague TODOs.

**Type consistency:** `HomeworkInput`/`MODULE_TYPES` (Task 4) used in generate (5), actions (7), generator (9); `TemplateRow` (Task 6) used in page (10); `GenResult`/`SaveResult` returned by actions and consumed in the generator; `callGenerate` (5) used by actions (7); folio-generate request shape (Task 2: moduleType/level/ageGroup/topic/verb) matches `callGenerate`'s body (Task 5). shadcn imports match installed exports (Button/Input/Label); native `<select>` used (no shadcn Select dependency).

## Notes for execution
- Task 1 touches LIVE bot generation — verify deno tests + redeploy + a real bot generation before proceeding. The move is verbatim (only the types import path changes) to keep risk minimal.
- Controller handles secrets/deploys: `FOLIO_GENERATE_SECRET` (Supabase secret + `.env.local`), function deploys, migration apply.
- Generation latency 10–30s; the action awaits it. Acceptable for local dev; streaming deferred.
- Anthropic model id stays as in the bot's code (`claude-sonnet-4-20250514`) — unchanged by the move.
