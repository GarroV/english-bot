# Folio M5 — Billing Tracker — Design Spec

> Date: 2026-06-15
> Status: Approved (design), pending implementation plan
> Milestone: M5 (Billing Tracker) — MVP slice (M5a)

---

## 1. Context

Folio (tutor admin, extension of english-bot; shared Supabase project, `folio_` prefix). M1–M4 + M7a/M7b done: auth, students (with `default_rate`), a weekly schedule of lessons (solo/group, `folio_lessons` + `folio_lesson_students` with an unused `rate_override`), and homework generation/assignment. M4 deferred the "состоялось → начисление" trigger; M5 wires it.

Per `MASTER_PROJECT §6.3`: money tracking (not a payment processor). `начислено по занятиям − зафиксированные оплаты = остаток`. Default rate lives on the student; can be overridden per lesson; the tutor records payments manually; the admin shows balances/debts.

## 2. Scope (M5a)

**In scope:**
- New ledger table `folio_student_payments` (type `charge` | `payment`), workspace RLS.
- **Auto-charge on lesson completion:** marking a lesson completed creates a `charge` row per student; reverting (reopen) or cancelling removes them. Charges exist iff `lesson.status = 'completed'`.
- Manual **payment** recording by the tutor.
- **Balances** per student (charged / paid / owed) + a per-student ledger (transactions).

**Out of scope (later):**
- Per-lesson rate-override UI (the `rate_override` column is honoured if set, but no UI sets it yet — charges use `default_rate`).
- Period filters / reports / export.
- Editing a charge amount (only delete-entry correction is provided).
- Currency handling (RUB implied, single currency).

## 3. Decisions (from brainstorm)

- **Materialized ledger** (`folio_student_payments`), not computed-on-the-fly. Balance = Σ(charge) − Σ(payment). Single source of truth, matches MASTER.
- **Auto-charge wired into the lesson status actions** (`completeLesson` creates, `reopenLesson`/`cancelLesson` reverse). Invariant: charges exist iff the lesson is `completed`.
- **Charge amount** per student = `lesson_students.rate_override ?? student.default_rate ?? 0`. A 0 charge (no rate set) is created and visible — the tutor sets the rate and can correct via delete + re-complete.
- **Idempotency:** `unique (lesson_id, student_id)` on the ledger. Charge rows carry `lesson_id`; payment rows have `lesson_id = null` (multiple nulls don't conflict). Re-completing never double-charges.

## 4. Data model — `folio_student_payments` (new migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK → folio_workspaces(id) on delete cascade | RLS anchor |
| `student_id` | uuid not null FK → folio_students(id) on delete cascade | |
| `amount` | numeric(10,2) not null | |
| `type` | text not null | CHECK in ('charge','payment') |
| `lesson_id` | uuid FK → folio_lessons(id) on delete cascade | nullable; set on auto-charges |
| `note` | text | nullable |
| `created_by` | uuid FK → folio_users(id) | |
| `created_at` | timestamptz not null default now() | |

- `unique (lesson_id, student_id)` — one charge per (lesson, student); payments (lesson_id null) unaffected.
- Index on `(workspace_id, student_id)`.
- **RLS** `workspace_isolation` `for all`: `using (workspace_id = folio_current_workspace_id())`; `with check (workspace_id = folio_current_workspace_id() and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id()))`.

## 5. Server layer

- **`lib/billing/amount.ts`** — pure `chargeAmount(rateOverride: number | null, defaultRate: number | null): number` = `rateOverride ?? defaultRate ?? 0`. Unit-tested.
- **`lib/billing/charges.ts`** — internal helpers (take the request-scoped supabase client):
  - `chargeForCompletedLesson(supabase, lessonId, userId)` — read the lesson's `workspace_id` + roster (`folio_lesson_students` joined to `folio_students.default_rate`); upsert one `charge` row per student (`amount = chargeAmount(...)`, `lesson_id` set) with `onConflict: "lesson_id,student_id", ignoreDuplicates: true`.
  - `reverseChargesForLesson(supabase, lessonId)` — delete `folio_student_payments` where `lesson_id = lessonId and type = 'charge'`.
- **`lib/lessons/actions.ts`** (MODIFY) — `completeLesson` calls `chargeForCompletedLesson` after the status update succeeds; `reopenLesson` and `cancelLesson` call `reverseChargesForLesson`. (Charges follow the completed invariant.)
- **`lib/billing/queries.ts`** — `listBalances()` → per active student `{ student_id, name, charged, paid, balance }` (aggregate the ledger); `listLedger(studentId)` → that student's entries (type, amount, lesson topic/date if any, note, created_at), newest first.
- **`lib/billing/actions.ts`** (`"use server"`) — `recordPayment(studentId, amount, note?)` (validate amount > 0, derive workspace+created_by from session, insert a `payment` row); `deleteEntry(id)` (delete a ledger row — correction).
- **`lib/billing/schema.ts`** — zod `paymentInputSchema` = `{ studentId: uuid, amount: positive number, note?: string }`.

## 6. UI — `(app)/billing` ("Деньги")

- **`page.tsx`** (server) — auth-guarded; `listBalances()`; render a balances table (student · charged · paid · **owed**, debts highlighted) with a "Записать оплату" action per row and a link/expand to the per-student ledger.
- **`BalancesList.tsx`** (client) — table + record-payment dialog (amount + note) → `recordPayment` → toast + refresh; debts (`balance > 0`) styled.
- **`StudentLedger.tsx`** (client, optional inline expand) — shows `listLedger(studentId)` entries with delete-entry; or a per-student route. (M5a: inline expand of recent entries.)
- Sidebar gets a "Деньги" item. i18n `Billing` namespace (ru/en).

## 7. Data flow

Lesson completed (M4 action) → `chargeForCompletedLesson` writes charges. Reopen/cancel → `reverseChargesForLesson`. Billing page → `listBalances`. Record payment → `recordPayment` → refresh. Balance is always Σcharge − Σpayment over the ledger.

## 8. Error handling & security

- `workspace_id`/`created_by` server-derived; charge `workspace_id` taken from the lesson row (RLS-authoritative). RLS isolates the ledger + with-check forbids cross-workspace student refs.
- zod validates payment input (amount > 0).
- Charge creation is idempotent (unique + ignoreDuplicates); reverse is a no-op when there are no charges.
- The auto-charge must not break lesson status changes: if charging errors, the status change still succeeded — log the charge error, don't fail the action (status is the source of truth; charges can be recomputed). Reverse likewise best-effort with logging.

## 9. Testing

- **Unit (vitest):** `chargeAmount` (override wins; falls back to default; 0 when both null); `paymentInputSchema` (rejects amount ≤ 0, non-uuid student).
- **RLS:** SQL — ledger rows in workspace A invisible under B; cross-workspace student insert rejected.
- **Integration (manual/SQL smoke):** complete a lesson → charge rows appear with the student's rate; reopen → they vanish; record a payment → balance drops.
- **Build/typecheck:** `tsc --noEmit` + `next build`; `/[locale]/billing` registered.

## 10. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_student_payments ✅` + migration entry; mark the `student_payments` draft realized.
- `Folio/docs/ARCHITECTURE.md` — add "Billing (M5)": ledger, auto-charge invariant wired into lesson status actions, balances.
- `Folio/docs/ROADMAP.md` — check off the M5 items done; note per-lesson rate-override UI + period filters deferred. Update the M4 note (the deferred "состоялось → начисление" trigger is now implemented in M5).
