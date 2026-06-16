# Folio M6 — Lesson Journal (design)

> Status: approved 2026-06-16. Extends `docs/ROADMAP.md` M6.

## Goal

After a lesson is marked «состоялось», the tutor can record a journal entry (what
happened, level, progress). Entries are viewable as a per-student history.

## Decisions (locked)

- **Trigger:** the ✓ checkbox stays a one-tap toggle (completion must stay simple).
  The journal is **not** auto-opened. Instead, a completed lesson exposes a
  «Журнал занятия» button (in `LessonDialog`) that opens the journal form.
- **Granularity:** one journal entry **per lesson** (not per student). For solo
  lessons that is the single student; for groups the entry is shared. Per-student
  history is derived through the roster (`journal → lesson → lesson_students`).
- **Progress:** free text (no rating scale / enum).

## Data model — `folio_lesson_journal`

| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| workspace_id | uuid not null | → `folio_workspaces`, RLS key |
| lesson_id | uuid not null | → `folio_lessons`, **`unique`** (one entry/lesson) |
| topic | text | тема |
| level | text | уровень (CEFR A1–C2, optional) |
| comment | text | комментарий — что было на занятии |
| progress | text | прогресс — свободный текст |
| created_by | uuid | → `folio_users` |
| created_at / updated_at | timestamptz | default `now()` |

- Index on `(workspace_id)`.
- **RLS** `workspace_isolation` (ALL) `using workspace_id = folio_current_workspace_id()`,
  `with check (workspace_id = folio_current_workspace_id() and lesson_id in
  (select id from folio_lessons where workspace_id = folio_current_workspace_id()))`
  — the cross-entity check prevents writing a journal row against a foreign-workspace
  lesson (FK checks bypass RLS), mirroring `folio_lesson_students` / `folio_student_payments`.

## Server layer — `src/lib/journal/`

- `schema.ts` — zod `journalInputSchema`: `{ topic?, level?, comment?, progress? }`,
  all optional trimmed strings with max lengths; reject an all-empty entry.
- `queries.ts`:
  - `getJournalForLesson(lessonId): JournalEntry | null`
  - `listJournalForStudent(studentId): JournalEntryWithLesson[]` — joins lesson date +
    type for the history view, newest first.
- `actions.ts` (`"use server"`): `saveJournalEntry(lessonId, input)` — validate, upsert
  on `lesson_id`; `workspace_id` + `created_by` from the session (never the client);
  request-scoped client so RLS applies.

## UI

- **Write** (`src/app/[locale]/(app)/schedule/`):
  - `JournalDialog.tsx` (client) — form (topic / level select / comment / progress);
    loads the existing entry on open via a server action; saves via `saveJournalEntry`.
  - `LessonDialog.tsx` — when editing a `completed` lesson, show «Журнал занятия»
    button. ScheduleBoard owns a `journalFor` state; opening the journal closes the
    lesson dialog (no nested dialogs).
- **History**:
  - `StudentsPanel.tsx` — clicking a student name opens `StudentJournalDialog.tsx`
    listing that student's journal entries (date · topic · level · comment · progress).
- i18n: new `Journal` namespace in `messages/ru.json` + `messages/en.json`.

## Out of scope (deferred)

- Progress rating scale / progress statistics (chose free text).
- Per-student journal rows for group lessons.
- Linking journal to homework assignments.

## Verification

Migration + RLS policy confirmed live; tsc / vitest / build; authenticated render
smoke (`scripts/smoke-render.mjs`); adversarial review workflow (RSC boundary,
RLS/security, TypeScript, a11y) with per-finding verification.
