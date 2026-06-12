# Folio M3 — Students — Design Spec

> Date: 2026-06-12
> Status: Approved (design), pending implementation plan
> Milestone: M3 (Students) from `Folio/docs/ROADMAP.md`

---

## 1. Context

Folio is an extension of english-bot (same repo `english_bot`, same Supabase project
`btlglelwxazdxfqdmcti`, `folio_` table prefix). M1 (foundation) and M2a (Telegram-login auth)
are done: a seeded `super_admin` can log in and reach `/[locale]/dashboard`. M3 adds the first
real domain module — the tutor's student roster.

Per `MASTER_PROJECT §6.1` and the `DATA_MODEL` draft, a student is a record the tutor keeps
(name, contacts, default lesson rate, notes), scoped to a workspace, with an active/archived
status. M3 builds CRUD over that record. Student login / invites are explicitly deferred
(M2 leftovers), so `folio_students.user_id` stays null in M3.

## 2. Scope

**In scope:**
- New table `folio_students` (workspace-scoped, RLS).
- List students (active by default; an "archived" filter to view archived).
- Create / edit a student profile (name, email, telegram_id, default_rate, notes).
- Soft archive + restore.

**Out of scope (later):**
- Student login / linking to a `folio_users` account (invite flow — deferred M2).
- PII scrub / "forget student" (a separate explicit action, added when aggregates exist).
- Lessons, payments, homework, journal (later milestones).
- Tutor-vs-super_admin distinction — in M3 the logged-in user operates within their own
  workspace; RLS enforces isolation.

## 3. Decisions (resolved during brainstorm)

- **Soft archive** (chosen over hard PII scrub): archive sets `archived_at` only; data is kept
  and the student can be restored. Irreversible PII scrubbing is a separate future action,
  warranted once there are aggregates (payments/lessons) to retain. This intentionally departs
  from a literal reading of `MASTER §6.1` ("PII deleted on archive") for M3, where no aggregates
  exist yet.
- **Currency:** `default_rate` is a plain `numeric(10,2)`; RUB is implied (RU/BY market). No
  currency column yet.
- **Required fields:** `name` only. `email`, `telegram_id`, `default_rate`, `notes` optional.
- **`user_id`:** nullable FK to `folio_users`, reserved for a future linked account; unused in M3.

## 4. Data model — `folio_students` (new migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `workspace_id` | uuid not null FK → folio_workspaces(id) | RLS anchor |
| `user_id` | uuid FK → folio_users(id) | nullable; future linked account |
| `name` | text not null | |
| `email` | text | nullable |
| `telegram_id` | bigint | nullable |
| `default_rate` | numeric(10,2) | nullable; RUB implied |
| `notes` | text | nullable |
| `archived_at` | timestamptz | nullable; soft archive |
| `created_at` | timestamptz not null default now() | |
| `updated_at` | timestamptz not null default now() | set by server actions on update |

- **RLS:** enabled with a `workspace_isolation` policy `for all`, both `using` and `with check`
  set to `workspace_id = folio_current_workspace_id()` (the `with check` is required so INSERTs
  are also scoped to the caller's workspace).
- Index on `workspace_id` for list queries.

## 5. Server layer — `folio/src/lib/students/`

- **`schema.ts`** — zod `studentInputSchema`: `name` (non-empty string), `email`
  (optional, valid email or empty→undefined), `telegramId` (optional positive int),
  `defaultRate` (optional, ≥ 0), `notes` (optional string). Exported inferred type
  `StudentInput`. Unit-tested.
- **`queries.ts`** — `listStudents(includeArchived: boolean)`: server-client select, ordered by
  `created_at` desc; filters `archived_at is null` unless `includeArchived`.
- **`actions.ts`** — `"use server"` actions, each: verify session (`supabase.auth.getUser()`,
  reject if none), validate input via zod, resolve the caller's `workspace_id` from
  `folio_users` (server-derived, never trusted from the client), perform the write through the
  request-scoped server client (RLS scopes/validates), then `revalidatePath` the students route.
  Actions: `createStudent`, `updateStudent`, `archiveStudent` (set `archived_at = now()`),
  `restoreStudent` (set `archived_at = null`). Each returns a small result
  `{ ok: true } | { ok: false; error: string }` (field errors surfaced from zod).

Business logic stays in `lib/` (Folio CLAUDE.md), never in components.

## 6. UI — `folio/src/app/[locale]/(app)/students/`

- **`page.tsx`** (server) — reads `?archived` search param, calls `listStudents`, renders the
  table and an "Add student" trigger. Auth is enforced by the dashboard-style `getUser()` guard
  + proxy.
- **`StudentsTable.tsx`** (client) — shadcn `Table`; per-row actions (edit, archive/restore);
  an archived/active filter toggle; opens the form dialog.
- **`StudentForm.tsx`** (client) — shadcn `Dialog` + `Input`/`Label`/`Button`; create or edit
  mode; calls the server action; `sonner` toast on success/failure; closes on success.
- All visible strings added to `messages/ru.json` and `messages/en.json` (ru default). User
  data (names/notes) is never translated.

## 7. Data flow

`page` (server) → `listStudents` → `StudentsTable`. Add/edit → `StudentForm` → server action →
zod validate → supabase write (RLS-scoped) → `revalidatePath` → toast → dialog closes → list
refreshes. Archive/restore → row action → server action → `revalidatePath`.

## 8. Error handling & security

- Validation at the boundary with zod; field errors returned to the form.
- `workspace_id` is derived server-side from the session user, never accepted from the client.
- RLS (`folio_current_workspace_id()`) enforces tenant isolation on every read/write, including
  INSERT (`with check`).
- DB/unexpected errors → action returns `{ ok: false, error }`; UI shows a toast.
- No secrets in client code; writes use the request-scoped server client (publishable key +
  auth cookie), not the admin/secret client.

## 9. Testing

- **Unit (vitest):** `studentInputSchema` — accepts a minimal valid student, rejects empty name,
  bad email, negative rate; coerces empty optional strings to undefined.
- **RLS:** verified via SQL — a row created in workspace A is not visible under workspace B's
  `folio_current_workspace_id()`.
- **Build/typecheck:** `tsc --noEmit` + `next build` pass; students routes registered.

## 10. Dependencies

- Add `zod` (input validation; aligns with project validation rules).

## 11. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_students ✅` section + migration entry.
- `Folio/docs/ARCHITECTURE.md` — add a "Students module (M3)" section.
- `Folio/docs/ROADMAP.md` — check off M3 items (list / create-edit / default rate / archive),
  note PII-scrub deferred.
