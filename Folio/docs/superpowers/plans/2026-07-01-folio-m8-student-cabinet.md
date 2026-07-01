# M8 Student Cabinet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline in this session). Steps use `- [ ]`.

**Goal:** Ship a token-link student cabinet (web, no login) showing homework (current/completed, on-screen text + PDF + "Я сделал") and upcoming lessons, plus tutor-side link generation and homework comment/review.

**Architecture:** Public Next route `/[locale]/s/[token]` resolves the token → student via service-role (no session; token is the capability). All reads/writes scope by `token→student_id`. PDF via a token-scoped Supabase Edge Function reusing the bot's `pdf.ts`. Tutor manages the link (student card) and comment/review (homework page).

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + service-role admin client), zod, Deno Edge Function (pdf-lib via existing `pdf.ts`), next-intl.

## Global Constraints

- Access = token capability; never trust `student_id`/`assignment_id` from input — re-verify against `token→student`.
- No new tables; migration is additive `ADD COLUMN` only.
- Group privacy: never expose co-students' names in the schedule.
- i18n: every new string gets `ru` + `en` keys in `messages/`.
- Money/balance is OUT of scope (M-later).
- Token: `randomBytes(24).toString("base64url")`.

---

### Task 1: Migration + data model doc

**Files:**
- Create: `supabase/migrations/20260701120000_folio_student_cabinet.sql`
- Modify: `Folio/docs/DATA_MODEL.md` (migrations list + affected tables)

- [ ] **Step 1: Write migration**
```sql
-- M8 student cabinet: token-link access + student "done" + tutor comment. All additive.
alter table folio_students add column cabinet_token text unique;
alter table folio_homework_assignments add column tutor_comment text;
alter table folio_homework_assignments add column submitted_at timestamptz;
```
- [ ] **Step 2:** Add the migration line to `DATA_MODEL.md` + note the new columns on `folio_students` / `folio_homework_assignments`.
- [ ] **Step 3: Commit** (`feat(folio): M8 migration — cabinet_token + tutor_comment + submitted_at`).

Apply to prod via Management API (`database/query`) + record in `schema_migrations` at deploy (Task 6).

---

### Task 2: `lib/cabinet` — token, queries, actions (+ unit tests)

**Files:**
- Create: `Folio/src/lib/cabinet/token.ts`, `queries.ts`, `actions.ts`, `derive.ts`
- Create: `Folio/src/lib/cabinet/__tests__/derive.test.ts`

**Interfaces (Produces):**
- `newCabinetToken(): string`
- `getCabinet(token: string): Promise<CabinetData | null>` where
  `CabinetData = { student: {id,name}, tutorName: string|null, current: CabAssignment[], completed: CabAssignment[], lessons: CabLesson[] }`
  `CabAssignment = { id, topic, level, moduleType, content, status, dueDate, tutorComment, submittedAt }`
  `CabLesson = { id, scheduledAt, durationMin, type: 'solo'|'group', locationType, status }` (NO co-student names)
- `markSubmitted(token: string, assignmentId: string): Promise<{ok:true}|{ok:false;error:string}>`

- [ ] **Step 1:** `token.ts` — `newCabinetToken` = `randomBytes(24).toString("base64url")` (node:crypto).
- [ ] **Step 2:** `derive.ts` — pure `splitAssignments(rows)` → `{current, completed}` (current = status assigned|submitted, completed = reviewed); `upcomingLessons(rows, nowISO)` → sorted upcoming (+ keep a few recent past), mapped to `CabLesson` WITHOUT participant names.
- [ ] **Step 3:** Failing unit test for `splitAssignments` + `upcomingLessons` (grouping + no-names + ordering).
- [ ] **Step 4:** Run `npm test` → fails.
- [ ] **Step 5:** Implement `derive.ts` → tests pass.
- [ ] **Step 6:** `queries.ts` — `getCabinet(token)` via `createAdminClient()`:
  resolve `folio_students` by `cabinet_token` (→ student + workspace); if none → null.
  Load assignments for `student_id` joined to `folio_homework_templates` (topic/level/module_type/content); load `folio_lesson_students`+`folio_lessons` for `student_id`. Map + `splitAssignments`/`upcomingLessons`. Resolve tutor name (workspace owner) best-effort.
- [ ] **Step 7:** `actions.ts` — `"use server"` `markSubmitted(token, assignmentId)`: admin client, resolve `token→student_id`, `update folio_homework_assignments set status='submitted', submitted_at=now() where id=assignmentId and student_id=<resolved> and status='assigned'`; `{error}` checked; return ok/false. Never trust input student_id.
- [ ] **Step 8:** Commit (`feat(folio): lib/cabinet — token/queries/actions + derive tests`).

---

### Task 3: Public cabinet route + UI + middleware

**Files:**
- Create: `Folio/src/app/[locale]/s/[token]/page.tsx` (server), `StudentCabinet.tsx` (`"use client"` for "Я сделал")
- Modify: `Folio/src/middleware.ts` (`PUBLIC_FIRST_SEGMENTS += "s"`)
- Modify: `Folio/messages/ru.json`, `en.json` (new `Cabinet` namespace)

**Consumes:** `getCabinet`, `markSubmitted` (Task 2).

- [ ] **Step 1:** middleware — add `"s"` to `PUBLIC_FIRST_SEGMENTS`.
- [ ] **Step 2:** `page.tsx` — `await getCabinet(token)`; if null → minimal "ссылка недействительна" view; else render `StudentCabinet` with data + labels. No `(app)` shell (own minimal layout: title + content).
- [ ] **Step 3:** `StudentCabinet.tsx` — sections: greeting; **Актуальные** (cards: topic·level·due·status badge, expandable content `<pre>`/prose, "Скачать PDF" link → PDF fn URL, "Я сделал" button when `assigned` → calls `markSubmitted` + `router.refresh()`, tutor comment if present); **Пройденные** (collapsed; content + tutor comment); **Ближайшие занятия** (date/time MSK, online/offline, solo/group badge). Empty states.
- [ ] **Step 4:** i18n keys (ru/en) for all strings.
- [ ] **Step 5:** `npx tsc --noEmit` green.
- [ ] **Step 6:** Commit (`feat(folio): student cabinet route + UI`).

---

### Task 4: `folio-homework-pdf` Edge Function (token-scoped)

**Files:**
- Create: `supabase/functions/folio-homework-pdf/index.ts`

- [ ] **Step 1:** `GET ?token&a=<assignmentId>`: service-role client; resolve `token→student`; verify assignment `id=a AND student_id=student`; load template content; `generatePdf(content)` from `../english-bot/lib/pdf.ts`; return `application/pdf` + `Content-Disposition: attachment; filename=...`. Missing/mismatch → 404.
- [ ] **Step 2:** `deno check supabase/functions/folio-homework-pdf/index.ts` green.
- [ ] **Step 3:** Commit (`feat(folio): folio-homework-pdf edge function (token-scoped)`).

Cabinet "Скачать PDF" links to `https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/folio-homework-pdf?token=<t>&a=<id>` (public URL, base configurable via existing env pattern).

---

### Task 5: Tutor side — cabinet link + comment/review

**Files:**
- Modify: `Folio/src/lib/students/actions.ts` (add `ensureCabinetToken`/`rotateCabinetToken`)
- Modify: student card UI (students page) — link button + copy
- Modify: `Folio/src/lib/homework/assignments.ts` (add `reviewAssignment(id, comment)`)
- Modify: `Folio/src/app/[locale]/(app)/homework/AssignmentsList.tsx` (comment input + "Проверено")
- Modify: `messages/ru.json`, `en.json`

- [ ] **Step 1:** `ensureCabinetToken(studentId)`: if student has no `cabinet_token`, set one (`newCabinetToken`), return it; gated to caller's workspace (RLS-scoped request client OR verify workspace). `rotateCabinetToken` overwrites.
- [ ] **Step 2:** Student card: "Кабинет ученика" → calls ensure, shows `.../s/<token>` with copy + "Обновить ссылку" (rotate). Mirror admin invite-link UX.
- [ ] **Step 3:** `reviewAssignment(id, comment)`: `update ... set status='reviewed', tutor_comment=comment` scoped; `{error}` checked.
- [ ] **Step 4:** `AssignmentsList` — comment textarea + "Проверено" button per assignment (or in a row action).
- [ ] **Step 5:** i18n + `npx tsc --noEmit` + `npm test` green.
- [ ] **Step 6:** Commit (`feat(folio): tutor — cabinet link + homework comment/review`).

---

### Task 6: Verify, PR, deploy, smoke

- [ ] **Step 1:** `npx tsc --noEmit`, `npm test`, `deno check` (pdf fn) — all green.
- [ ] **Step 2:** Push branch `feat/folio-student-cabinet`, open PR, CI green, merge.
- [ ] **Step 3:** Apply migration via Management API + record in `schema_migrations`.
- [ ] **Step 4:** Deploy `folio-homework-pdf` (`supabase functions deploy folio-homework-pdf --no-verify-jwt --project-ref btlglelwxazdxfqdmcti`) + Folio (`npm run cf:deploy`).
- [ ] **Step 5:** Smoke: generate a cabinet token for a real student (tutor UI), open `/s/<token>`, verify assignments + lessons + "Я сделал" + PDF download; verify unknown token → invalid view.

---

## Self-review

- **Spec coverage:** access(T3)/data(T1)/homework view+PDF+"Я сделал"(T2,T3,T4)/schedule(T2,T3)/tutor link+comment(T5)/security scoping(T2,T4)/deploy+smoke(T6) — all covered.
- **Placeholders:** none (logic code inline; UI described concretely).
- **Type consistency:** `getCabinet`/`markSubmitted`/`newCabinetToken`/`reviewAssignment`/`ensureCabinetToken` names consistent across tasks.
