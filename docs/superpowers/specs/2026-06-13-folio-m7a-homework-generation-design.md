# Folio M7a — Homework Generation — Design Spec

> Date: 2026-06-13
> Status: Approved (design), pending implementation plan
> Milestone: M7a — first slice of M7 (Homeworks / Bot Bridge) from `Folio/docs/ROADMAP.md`

---

## 1. Context

Folio (tutor admin) extends english-bot in the same repo + Supabase project (`btlglelwxazdxfqdmcti`), `folio_` prefix. M1–M4 done (auth, dashboard, students, schedule) + a Soft Friendly design base. The user wants the web app and the bot to be **equipotent** ([[project-web-bot-parity]]): assignment generation must exist in the Folio web admin, not only in the Telegram bot.

Today the bot generates assignments entirely in `supabase/functions/english-bot/lib/claude.ts` (Deno + Anthropic SDK): inline Russian prompts per module type and `generateModuleContent(moduleType, params, userInput) → string`. Module types: `READING_MODULE`, `VOCABULARY_MODULE`, `TRANSLATION_TEXTS`, `TRANSLATION_SENTENCES`, `VERB_SENTENCES`. Params: `level`, `ageGroup`, `version`, `targetVerb`.

M7 is large (generation + templates + assignment + delivery + bot integration). This spec is **M7a**: the generation window in the web, backed by a shared engine so web and bot never diverge.

## 2. Scope

**In scope:**
- Extract generation into a **shared module** `supabase/functions/_shared/generate.ts` (single source of prompts + logic).
- Refactor english-bot to import from `_shared` (no behaviour change; tested + redeployed).
- A **`folio-generate` Edge Function** (HTTP, secret-gated) that the web calls.
- New table `folio_homework_templates` (workspace-scoped, RLS).
- Folio web: a generation form (module type / topic / level / age / [verb]) → generate → preview → **save as template**; plus a list of saved templates. Sidebar nav item.

**Out of scope (later slices):**
- Assigning a template to a student (`folio_homework_assignments`) and delivery (Telegram / email / PDF).
- Teacher-guide and edit-in-place generation in the web (the shared engine keeps them for the bot; web exposes them later).
- Template Editor (prompts in DB / `template_prompts`).
- Generation caching / `bot_cache_key`.
- Streaming generation output (web shows a loading state; result arrives whole).

## 3. Decisions (resolved during brainstorm)

- **Shared engine = shared code module**, not duplicated prompts. `_shared/generate.ts` holds the prompts + `generateModuleContent`; the bot imports it directly (in-process, no extra hop) and the web reaches it via the `folio-generate` HTTP function. Same code runs in both → no prompt drift. (This is the "общий движок" choice.)
- **First slice = the generation window** (generate → preview → save template + list). Assignment/delivery deferred.
- **Function auth:** shared secret header (`FOLIO_GENERATE_SECRET`), function deployed `--no-verify-jwt` (matching the bot), the function rejects requests without the matching secret. Chosen over JWT for simplicity; the secret is server-only on both ends.
- **Template `module_type`:** stored as `text` with a `CHECK` of the 5 known types (documents intent without a migration-heavy enum).
- **Web generates `version: "student"` only** in M7a; teacher guide deferred.

## 4. Shared engine

### 4.1 `supabase/functions/_shared/generate.ts`
- Move from the bot's `lib/claude.ts`: the prompt templates, `buildPrompt`, `generateModuleContent`, `generateTeacherGuide`, `applyEdit`, and the `Anthropic` client (keyed by `ANTHROPIC_KEY`). Deno + `npm:@anthropic-ai/sdk`.
- Exports the same function signatures it has today, so callers change only their import path.

### 4.2 english-bot refactor
- `lib/claude.ts` re-exports from `../../_shared/generate.ts` (or its call sites import from `_shared`). No behaviour change. The bot's `ModuleType`/`ClarifyingParams` types move or are shared so both reference one definition.
- Verified by `deno test supabase/functions/english-bot/lib/ --allow-env`, then redeployed and smoke-tested (generate one task in the bot).

### 4.3 `supabase/functions/folio-generate/index.ts`
- `Deno.serve` HTTP handler. Rejects non-POST. Requires header `x-folio-secret === Deno.env.get("FOLIO_GENERATE_SECRET")` (else 401). Parses `{ moduleType, level, ageGroup, topic, verb? }`, validates `moduleType` is one of the 5, calls `generateModuleContent(moduleType, { level, ageGroup, version: "student", targetVerb: verb }, topic)`, returns `{ content }`. Errors → 4xx/5xx with a short message.
- Deployed `supabase functions deploy folio-generate --no-verify-jwt`. Uses existing `ANTHROPIC_KEY` secret + new `FOLIO_GENERATE_SECRET` secret.

## 5. Data model — `folio_homework_templates` (new migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK → folio_workspaces(id) on delete cascade | RLS anchor |
| `module_type` | text not null | CHECK in the 5 module types |
| `level` | text | e.g. A2/B1/B2/C1/C2 |
| `age_group` | text | teen/young_adult/adult |
| `topic` | text not null | the generation input |
| `content` | text not null | the generated assignment |
| `source` | text not null default 'web' | 'web' \| 'bot' |
| `created_by` | uuid FK → folio_users(id) | |
| `created_at` / `updated_at` | timestamptz not null default now() | |

Index on `workspace_id`. RLS `workspace_isolation` (`for all`, using + with check `workspace_id = folio_current_workspace_id()`).

## 6. Web — `folio/src/lib/homework/` + `(app)/homework`

- **`schema.ts`** — zod `homeworkInputSchema`: `moduleType` (enum of the 5), `topic` (non-empty), `level` (string), `ageGroup` (string), `verb` (optional; required when `moduleType === "VERB_SENTENCES"` — enforced with a refine). Unit-tested.
- **`generate.ts`** — server-only `generateHomework(input)`: `fetch(FOLIO_GENERATE_URL, { method:"POST", headers:{ "x-folio-secret": FOLIO_GENERATE_SECRET }, body })` → returns `{ content }`; throws on non-ok.
- **`queries.ts`** — `listTemplates()` (workspace-scoped, newest first).
- **`actions.ts`** — `"use server"`: `generateHomework(input)` (validate, call the function, return `{ ok, content }` — **not** persisted) and `saveTemplate(input, content)` (validate, derive `workspace_id` + `created_by` from session, insert). Both return `{ ok } | { ok:false, error }`.
- **UI** `(app)/homework/page.tsx` (auth-guarded; lists templates) + `HomeworkGenerator.tsx` (client: pick module type, topic, level, age, verb-if-needed → "Сгенерировать" (loading state) → preview the returned text → "Сохранить шаблон" → toast + refresh) + a templates list (type · topic · level · created). Sidebar gets a "Домашки" item.
- i18n `Homework` namespace (ru/en).

## 7. Data flow

Form → `generateHomework` action → `folio-generate` (secret) → shared `generateModuleContent` (Claude) → content back to the form (preview). "Save" → `saveTemplate` action → insert `folio_homework_templates` (RLS) → `router.refresh()` → toast. List page reads templates via `listTemplates`.

## 8. Error handling & security

- `FOLIO_GENERATE_SECRET` gates the function; secret stays server-side (Supabase secret + Folio `.env.local`), never in the client bundle or browser calls (the browser calls the Folio server action, which holds the secret).
- zod validation at the form boundary and in actions; `workspace_id`/`created_by` derived from the session, never the client.
- RLS isolates templates per workspace (with check on insert).
- Generation/network errors → `{ ok:false, error }` → toast; the bot refactor must not change bot behaviour (covered by tests + smoke).

## 9. Testing

- **Unit (vitest):** `homeworkInputSchema` — valid per type; rejects empty topic; requires `verb` for `VERB_SENTENCES`.
- **Bot:** `deno test supabase/functions/english-bot/lib/` stays green after the `_shared` refactor; smoke-generate one task in the bot after redeploy.
- **folio-generate:** manual curl with the secret returns content; without/with wrong secret → 401.
- **RLS:** SQL — a template in workspace A is invisible under workspace B.
- **Build/typecheck:** `tsc --noEmit` + `next build`; `/[locale]/homework` registered.

## 10. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_homework_templates ✅` + migration entry; note the draft `homework_templates` is partially realized.
- `Folio/docs/ARCHITECTURE.md` — add "Homework generation (M7a)": shared `_shared/generate.ts` engine, `folio-generate` function, web module; note web↔bot parity.
- `Folio/docs/ROADMAP.md` — check off the M7 generation items done in M7a; leave assignment/delivery unchecked.
- english-bot `docs/CHANGELOG.md` + `docs/BOT.md` — generation moved to `_shared/generate.ts`; bot now imports it.
- After bot changes: commit → push → `supabase functions deploy english-bot --no-verify-jwt` (and deploy `folio-generate`).
