# Folio M7b — Homework Assignment — Design Spec

> Date: 2026-06-15
> Status: Approved (design), pending implementation plan
> Milestone: M7b — second slice of M7 (Homeworks)

---

## 1. Context

M7a shipped homework generation in the Folio web: a shared engine (`_shared/generate.ts` used by the bot and the secret-gated `folio-generate` Edge Function), the `folio_homework_templates` table, and a generation form that saves templates. M7b closes the loop: assigning a saved template to students, with a due date and status — so the tutor tracks who got what.

Delivery (sending the assignment to the student) is deliberately **out of scope** here: Telegram bots cannot message a user who hasn't started the bot (folio_students have a tutor-entered `telegram_id` but haven't started `@garro_oracle_bot`), and there is no email/n8n infra. Automated delivery is M7c (needs student bot-onboarding or email). For M7b the tutor shares the content manually (view/copy) and tracks status.

## 2. Scope

**In scope:**
- New table `folio_homework_assignments` (workspace RLS).
- Assign a template to one or more students, with an optional due date.
- View assignments (student · topic · due · status) and change status (assigned → submitted → reviewed).
- View/copy a template's content (so the tutor can share it manually).

**Out of scope (later):**
- Automated delivery via Telegram or email (M7c; needs student onboarding to the bot / email infra).
- Student cabinet view of assignments (M8).
- PDF export of a template/assignment in the web.
- Submission upload by the student / grading.

## 3. Decisions (resolved during brainstorm)

- **Manual delivery for M7b** — assign + track only; the tutor copies the content and shares it. Automated delivery deferred (Telegram start-restriction + no email infra). Confirmed during brainstorm.
- `status` enum `assigned / submitted / reviewed`, default `assigned`; the tutor manages it manually.
- Assigning is driven from the template (template → pick students). Per-student assigning is deferred.

## 4. Data model — `folio_homework_assignments` (new migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK → folio_workspaces(id) on delete cascade | RLS anchor |
| `template_id` | uuid not null FK → folio_homework_templates(id) on delete cascade | |
| `student_id` | uuid not null FK → folio_students(id) on delete cascade | |
| `assigned_by` | uuid FK → folio_users(id) | the tutor |
| `due_date` | date | nullable |
| `status` | text not null default 'assigned' | CHECK in (assigned, submitted, reviewed) |
| `note` | text | nullable |
| `assigned_at` | timestamptz not null default now() | |
| `created_at` / `updated_at` | timestamptz not null default now() | |

- Index on `(workspace_id, template_id)` and on `student_id`.
- Unique `(template_id, student_id)` — a template is assigned to a given student at most once.
- **RLS** `workspace_isolation` `for all`:
  - `using (workspace_id = folio_current_workspace_id())`
  - `with check (workspace_id = folio_current_workspace_id() and template_id in (select id from folio_homework_templates where workspace_id = folio_current_workspace_id()) and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id()))` — prevents cross-workspace template/student references (the lesson_students-style gap).

## 5. Server layer — `folio/src/lib/homework/`

- **`assignments-schema.ts`** — zod: `assignInputSchema` = `{ templateId: uuid, studentIds: array(uuid).min(1), dueDate: optional(string regex YYYY-MM-DD) }`; `ASSIGNMENT_STATUSES = ['assigned','submitted','reviewed']`. Unit-tested.
- **`assignments.ts`** — server:
  - `assignTemplate(input)` — validate; derive `workspace_id` + `assigned_by` from session; insert N rows (one per student) with `on conflict (template_id, student_id) do nothing` semantics via pre-filtering or ignore-duplicate handling; return `{ ok }`.
  - `listAssignments()` — workspace assignments joined with student name + template topic/type, newest first.
  - `updateAssignmentStatus(id, status)` — validate status ∈ ASSIGNMENT_STATUSES; update; 0-row → not found.
  - All return `{ ok } | { ok:false, error }`.
- Extends existing `lib/homework/queries.ts` (`listTemplates` already returns `content`).

## 6. UI — `(app)/homework`

- **Template list** (existing): each template row gains
  - **"Просмотр"** — toggle to reveal the `content` in a `<pre>` + a "Копировать" button (manual sharing).
  - **"Назначить"** — opens a dialog: multi-select active students (reuse the students picker pattern) + an optional due date (`<input type="date">`) → `assignTemplate` → toast + refresh.
- **Assignments section** — a list below the generator/templates: student · template topic · type · due date · status, with a status control (cycle/select assigned→submitted→reviewed via `updateAssignmentStatus`). `router.refresh()` after changes.
- New i18n keys in the `Homework` namespace (ru/en): assign, view, copy, copied, dueDate, assignments, assignedTo, status labels, statusAssigned/Submitted/Reviewed, assigned (toast), etc.

## 7. Data flow

Template "Назначить" → dialog (students + due) → `assignTemplate` → insert rows (RLS) → refresh → toast. Assignments list reads `listAssignments`. Status change → `updateAssignmentStatus` → refresh.

## 8. Error handling & security

- zod at the boundary; `workspace_id`/`assigned_by` server-derived, never client.
- RLS isolates assignments and (via with-check) forbids referencing another workspace's template or student.
- Duplicate assignment (same template+student) is ignored (unique constraint + graceful handling), not an error surfaced to the user.
- 0-row status updates → `not found`.

## 9. Testing

- **Unit (vitest):** `assignInputSchema` — valid; rejects empty studentIds, non-uuid, bad dueDate format; `updateAssignmentStatus` rejects unknown status (schema-level).
- **RLS:** SQL — an assignment in workspace A invisible under workspace B; cross-workspace template/student insert rejected by with-check.
- **Build/typecheck:** `tsc --noEmit` + `next build`.

## 10. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_homework_assignments ✅` + migration entry.
- `Folio/docs/ARCHITECTURE.md` — extend "Homework" with assignment + manual-delivery note.
- `Folio/docs/ROADMAP.md` — check off M7 "Назначение домашки ученику"; note delivery (M7c) deferred with the Telegram/email reason.
