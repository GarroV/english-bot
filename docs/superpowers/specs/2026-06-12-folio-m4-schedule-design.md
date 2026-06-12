# Folio M4 — Schedule — Design Spec

> Date: 2026-06-12
> Status: Approved (design), pending implementation plan
> Milestone: M4 (Schedule) from `Folio/docs/ROADMAP.md`

---

## 1. Context

Folio (tutor admin, extension of english-bot; shared repo + Supabase project `btlglelwxazdxfqdmcti`, `folio_` prefix). M1–M3 done: Telegram login, dashboard, students CRUD, plus a Soft Friendly design base (token theme, Oswald/Roboto, `(app)` sidebar shell). M4 adds the schedule — a weekly calendar of lessons.

Per `MASTER_PROJECT §6.2`: an interactive Google-Calendar-style board; solo (1-on-1) and group lessons; online/offline; actions create / reschedule / cancel / mark "состоялось" (completed); clicking a lesson reveals its details. The documented model uses `lessons` + `lesson_students` (m2m). The "состоялось" mark will later trigger billing (M5) and the journal (M6); those are not built yet, so in M4 it only sets status.

## 2. Scope

**In scope:**
- Tables `folio_lessons` + `folio_lesson_students` (m2m), workspace RLS.
- A custom **weekly calendar grid** (7 day columns × hourly rows), week navigation.
- Create a lesson (solo or group), online/offline, duration, notes.
- Reschedule (change date/time — via dialog, not drag), cancel, mark completed.
- Lesson detail/actions on click.

**Out of scope (later):**
- Drag-and-drop reschedule (use the dialog).
- Month/day views; overlapping-event layout polish (M4 renders full-width blocks; concurrent lessons may visually overlap).
- Recurring lessons.
- Per-user timezone handling (M4 uses the browser's local time; the `folio_users.timezone` field is reserved for later).
- Billing auto-charge (M5) and journal prompt (M6) on completion — completion only sets status in M4.
- Full group nuances (per-student amounts, student-can't-see-others) — M5 / Student Cabinet.

## 3. Decisions (resolved during brainstorm)

- **Weekly grid now** (chosen over an agenda list), built **custom** (no calendar library) for full control of the Soft Friendly look and zero Next 16 / React 19 compatibility risk.
- **m2m model, solo + group** from the start (`folio_lessons` + `folio_lesson_students`) — no later migration.
- **Lesson type is derived** from the roster size: 1 student → `solo`, 2+ → `group` (no separate type toggle in the form).
- **Status** enum is `scheduled / completed / cancelled`. Rescheduling is just an update of `scheduled_at`; status stays `scheduled` (the draft's `rescheduled` status is dropped as redundant).
- **Reschedule via dialog** (date/time edit), not drag-and-drop.
- **Time**: stored as `timestamptz`; the UI uses the browser's local time (`datetime-local` → ISO → local display). Correct for the single Moscow tutor; explicit per-user timezone deferred.
- **Grid hours**: 07:00–22:00 (a constant), week starts **Monday** (RU convention).

## 4. Data model (new migration)

Enums: `folio_lesson_type (solo, group)`, `folio_lesson_status (scheduled, completed, cancelled)`, `folio_location_type (online, offline)`.

`folio_lessons`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK → folio_workspaces(id) on delete cascade | RLS anchor |
| `type` | folio_lesson_type not null | derived from roster size |
| `scheduled_at` | timestamptz not null | |
| `duration_min` | int not null default 60 | |
| `status` | folio_lesson_status not null default 'scheduled' | |
| `location_type` | folio_location_type not null default 'online' | |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz not null default now() | |

Index on `(workspace_id, scheduled_at)`.

`folio_lesson_students`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `lesson_id` | uuid not null FK → folio_lessons(id) on delete cascade | |
| `student_id` | uuid not null FK → folio_students(id) on delete cascade | |
| `rate_override` | numeric(10,2) | nullable; M5 |
| `amount_charged` | numeric(10,2) | nullable; M5 |
| `created_at` | timestamptz not null default now() | |
| | | `unique (lesson_id, student_id)` |

Index on `lesson_id`.

**RLS:**
- `folio_lessons`: `workspace_isolation` `for all` using + with check `workspace_id = folio_current_workspace_id()`.
- `folio_lesson_students`: `for all` using + with check
  `lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id())`
  (parent-scoped, like `folio_auth_methods`).

## 5. Server layer — `folio/src/lib/lessons/`

- **`schema.ts`** — zod `lessonInputSchema`: `scheduledAt` (ISO datetime string), `durationMin` (int 1–600), `locationType` (`online`|`offline`), `studentIds` (string[], min 1), `notes` (optional). Helper `lessonTypeFor(studentIds)` → `'solo' | 'group'`. Unit-tested.
- **`week.ts`** — pure helpers: `weekRange(monday: Date)` → `{ fromISO, toISO }` (Mon 00:00 → next Mon 00:00); `startOfWeek(date)` (Monday). Unit-tested.
- **`queries.ts`** — `listLessonsInRange(fromISO, toISO)`: lessons whose `scheduled_at` ∈ [from,to) with their students (joined name); `listActiveStudents()` → `{id, name}[]` for the picker (active only).
- **`actions.ts`** — `"use server"`: `createLesson(input)` (insert lesson with derived type; then insert lesson_students; if the student insert errors, delete the just-created lesson and return error — no orphan); `rescheduleLesson(id, scheduledAt, durationMin)`; `cancelLesson(id)` (status=cancelled); `completeLesson(id)` (status=completed). All: verify session, derive `workspace_id` from the caller's `folio_users` (never client), zod-validate, write via the RLS-scoped server client. Return `{ ok } | { ok:false, error }`.

## 6. UI — `folio/src/app/[locale]/(app)/schedule/`

- **`page.tsx`** (server) — auth-guarded (getUser → redirect login); reads `?week=YYYY-MM-DD` (Monday) or defaults to the current week; computes range; `listLessonsInRange` + `listActiveStudents`; renders `ScheduleBoard`.
- **`ScheduleBoard.tsx`** (client) — week header with prev/next/"today" (navigates `?week=`); a 7-column grid (Mon–Sun) × hour rows 07:00–22:00; lessons rendered as positioned blocks (top/height from start/duration in local time); status styling (completed = muted + check, cancelled = strikethrough/faded); click empty slot → open create dialog with that datetime prefilled; click a lesson → detail/actions (reschedule / cancel / complete). `router.refresh()` after a successful action.
- **`LessonDialog.tsx`** (client) — create / reschedule. Fields: date+time (`datetime-local`), duration (min), location (online/offline), **student multi-select** (checkbox list from `listActiveStudents`), notes. Calls the server action; sonner toast; closes on success.
- New i18n strings (`Schedule` namespace) in ru/en. A `Schedule`/`Расписание` nav item added to `AppSidebar`.

## 7. Data flow

`page` (server) → `listLessonsInRange` + `listActiveStudents` → `ScheduleBoard`. Create/edit → `LessonDialog` → server action → zod → supabase (RLS) → `router.refresh()` → toast. Reschedule/cancel/complete → action → refresh. Week nav → `?week=` change → server re-query.

## 8. Error handling & security

- zod validation at the boundary; field/first-issue error returned to the dialog.
- `workspace_id` derived server-side; never from the client. RLS enforces tenant isolation on both tables (with check on insert), including the join table via the parent subquery.
- `createLesson` cleans up the lesson row if the student-rows insert fails (no orphaned lessons).
- DB/unexpected errors → `{ ok:false, error }` → toast. Server client only (no admin/secret key in this module).

## 9. Testing

- **Unit (vitest):** `lessonInputSchema` (valid minimal/full; reject empty studentIds, bad duration, bad datetime); `lessonTypeFor` (1→solo, 2+→group); `week.ts` (`startOfWeek` lands on Monday; `weekRange` spans 7 days).
- **RLS:** SQL — a lesson + its lesson_students in workspace A are invisible under workspace B's `folio_current_workspace_id()`.
- **Build/typecheck:** `tsc --noEmit` + `next build` pass; `/[locale]/schedule` registered.

## 10. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_lessons ✅` + `folio_lesson_students ✅` + migration entry; mark old prefix-less drafts superseded.
- `Folio/docs/ARCHITECTURE.md` — add a "Schedule module (M4)" section.
- `Folio/docs/ROADMAP.md` — check off M4 items; note drag-and-drop / month view / per-user tz / completion-triggers deferred.
