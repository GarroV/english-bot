# Folio M5 — Billing Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track money: auto-charge students when a lesson is completed, record payments manually, show per-student balances — at `/[locale]/billing`.

**Architecture:** A `folio_student_payments` ledger (charge/payment) with workspace RLS. Charges are created/reversed by the lesson status actions (invariant: charges exist iff `lesson.status='completed'`). Balances are aggregated in JS from the ledger. Server actions record payments and delete entries.

**Tech Stack:** Next.js 16 (Server Actions), @supabase/ssr, zod 4, shadcn/ui, next-intl 4. RUB implied.

**Spec:** `docs/superpowers/specs/2026-06-15-folio-m5-billing-design.md`

---

## File Structure

- `supabase/migrations/<ts>_folio_student_payments.sql` — ledger table + RLS. NEW
- `folio/src/lib/billing/amount.ts` — pure `chargeAmount`. NEW
- `folio/src/lib/billing/schema.ts` — `paymentInputSchema`, `PaymentInput`. NEW
- `folio/src/lib/billing/__tests__/billing.test.ts` — vitest (amount + schema). NEW
- `folio/src/lib/billing/charges.ts` — `chargeForCompletedLesson`, `reverseChargesForLesson`. NEW
- `folio/src/lib/lessons/actions.ts` — wire complete/reopen/cancel to charges. MODIFY
- `folio/src/lib/billing/queries.ts` — `listBalances`, `listLedgerEntries`, types. NEW
- `folio/src/lib/billing/actions.ts` — `recordPayment`, `deleteEntry`. NEW
- `folio/src/app/[locale]/(app)/billing/page.tsx` — server page. NEW
- `folio/src/app/[locale]/(app)/billing/BalancesList.tsx` — client. NEW
- `folio/src/app/[locale]/(app)/AppSidebar.tsx` — add "Деньги" nav. MODIFY
- `folio/messages/{ru,en}.json` — `Billing` namespace + `Nav.billing`. MODIFY
- `Folio/docs/{DATA_MODEL,ARCHITECTURE,ROADMAP}.md` — DoD.

Conventions: TS strict, no `any` without `// reason:`. `@/*` → `folio/src/*`. Commit per task; `Folio/...` case; verify `git status` after. Work on `main`. No deploy.

---

### Task 1: Migration — `folio_student_payments`

**Files:** Create `supabase/migrations/<ts>_folio_student_payments.sql` (timestamp after `20260615151554`).

- [ ] **Step 1: Write**
```sql
-- Folio M5: money ledger (charge/payment). Workspace-scoped RLS.
create table folio_student_payments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  student_id   uuid not null references folio_students(id) on delete cascade,
  amount       numeric(10,2) not null,
  type         text not null check (type in ('charge','payment')),
  lesson_id    uuid references folio_lessons(id) on delete cascade,
  note         text,
  created_by   uuid references folio_users(id),
  created_at   timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index folio_student_payments_ws_student_idx on folio_student_payments (workspace_id, student_id);

alter table folio_student_payments enable row level security;
create policy "workspace_isolation" on folio_student_payments
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (
    workspace_id = folio_current_workspace_id()
    and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id())
  );
```
- [ ] **Step 2: Apply** — `supabase db push` (or MCP `apply_migration`; rename local to recorded version).
- [ ] **Step 3: Verify** — `supabase db query --linked "select column_name from information_schema.columns where table_name='folio_student_payments' order by ordinal_position"`.
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/*_folio_student_payments.sql
git commit -m "feat(db): add folio_student_payments ledger with workspace RLS"
```

---

### Task 2: amount + schema (TDD)

**Files:** Create `folio/src/lib/billing/amount.ts`, `folio/src/lib/billing/schema.ts`, `folio/src/lib/billing/__tests__/billing.test.ts`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { chargeAmount } from "../amount";
import { paymentInputSchema } from "../schema";

const S = "11111111-1111-4111-8111-111111111111";

describe("chargeAmount", () => {
  it("uses the override when present", () => { expect(chargeAmount(150, 100)).toBe(150); });
  it("falls back to the default rate", () => { expect(chargeAmount(null, 100)).toBe(100); });
  it("is 0 when neither is set", () => { expect(chargeAmount(null, null)).toBe(0); });
});

describe("paymentInputSchema", () => {
  it("accepts a positive amount", () => {
    expect(paymentInputSchema.safeParse({ studentId: S, amount: 500 }).success).toBe(true);
  });
  it("rejects zero/negative", () => {
    expect(paymentInputSchema.safeParse({ studentId: S, amount: 0 }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ studentId: S, amount: -5 }).success).toBe(false);
  });
  it("rejects a non-uuid student", () => {
    expect(paymentInputSchema.safeParse({ studentId: "x", amount: 500 }).success).toBe(false);
  });
});
```
- [ ] **Step 2: Run → FAIL** — `cd folio && npm test`.
- [ ] **Step 3: Implement `amount.ts`**
```ts
// Charge for one student on a completed lesson: per-lesson override wins, else the
// student's default rate, else 0 (no rate set — visible so the tutor can correct).
export function chargeAmount(rateOverride: number | null, defaultRate: number | null): number {
  return rateOverride ?? defaultRate ?? 0;
}
```
- [ ] **Step 4: Implement `schema.ts`**
```ts
import { z } from "zod";

export const paymentInputSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).optional(),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;
```
- [ ] **Step 5: Run → PASS** — `npm test`.
- [ ] **Step 6: Commit**
```bash
git add Folio/src/lib/billing/amount.ts Folio/src/lib/billing/schema.ts Folio/src/lib/billing/__tests__/billing.test.ts
git commit -m "feat(folio): billing chargeAmount + payment schema with tests"
```

---

### Task 3: charges (engine helpers)

**Files:** Create `folio/src/lib/billing/charges.ts`.

- [ ] **Step 1: Implement**
```ts
import { createClient } from "@/lib/supabase/server";
import { chargeAmount } from "./amount";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface RosterRow {
  student_id: string;
  rate_override: number | null;
  folio_students: { default_rate: number | null } | { default_rate: number | null }[] | null;
}

// Create one 'charge' per student of a completed lesson. Idempotent (unique lesson_id+student_id).
// workspace_id comes from the lesson row (RLS-authoritative). Best-effort: callers log failures.
export async function chargeForCompletedLesson(supabase: SupabaseClient, lessonId: string, userId: string): Promise<void> {
  const { data: lesson } = await supabase
    .from("folio_lessons").select("workspace_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return;
  const { data: roster } = await supabase
    .from("folio_lesson_students")
    .select("student_id, rate_override, folio_students(default_rate)")
    .eq("lesson_id", lessonId);

  const rows = ((roster as RosterRow[]) ?? []).map((r) => {
    const fs = Array.isArray(r.folio_students) ? r.folio_students[0] : r.folio_students;
    return {
      workspace_id: (lesson as { workspace_id: string }).workspace_id,
      student_id: r.student_id,
      type: "charge" as const,
      amount: chargeAmount(r.rate_override ?? null, fs?.default_rate ?? null),
      lesson_id: lessonId,
      created_by: userId,
    };
  });
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("folio_student_payments")
    .upsert(rows, { onConflict: "lesson_id,student_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// Remove the charges tied to a lesson (on reopen/cancel).
export async function reverseChargesForLesson(supabase: SupabaseClient, lessonId: string): Promise<void> {
  const { error } = await supabase
    .from("folio_student_payments").delete().eq("lesson_id", lessonId).eq("type", "charge");
  if (error) throw new Error(error.message);
}
```
- [ ] **Step 2: tsc** — `cd folio && npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/billing/charges.ts
git commit -m "feat(folio): billing charge helpers (create/reverse per lesson)"
```

---

### Task 4: wire lesson actions to charges

**Files:** Modify `folio/src/lib/lessons/actions.ts`.

- [ ] **Step 1: Add the import** at the top of `actions.ts`:
```ts
import { chargeForCompletedLesson, reverseChargesForLesson } from "@/lib/billing/charges";
```
- [ ] **Step 2: Replace the three status wrappers** (read the file; the current `completeLesson`/`reopenLesson`/`cancelLesson` each just `return setStatus(...)`). Replace with:
```ts
// Mark completed and create per-student charges (best-effort: status is the source of truth).
export async function completeLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "completed");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await chargeForCompletedLesson(supabase, id, user.id);
  } catch (e) {
    console.error(`completeLesson: charging failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

// Back to scheduled; remove the lesson's charges.
export async function reopenLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "scheduled");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    await reverseChargesForLesson(supabase, id);
  } catch (e) {
    console.error(`reopenLesson: reversing charges failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

// Cancel; a cancelled lesson is not billed, so remove any charges too.
export async function cancelLesson(id: string): Promise<ActionResult> {
  const res = await setStatus(id, "cancelled");
  if (!res.ok) return res;
  try {
    const supabase = await createClient();
    await reverseChargesForLesson(supabase, id);
  } catch (e) {
    console.error(`cancelLesson: reversing charges failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}
```
(`createClient` is already imported in `actions.ts`; `setStatus` and `ActionResult` already exist.)
- [ ] **Step 3: tsc + tests + bot? (N/A)** — `npx tsc --noEmit && npm test` (folio tests stay green).
- [ ] **Step 4: Commit**
```bash
git add Folio/src/lib/lessons/actions.ts
git commit -m "feat(folio): auto-charge on lesson complete; reverse on reopen/cancel"
```

---

### Task 5: queries — balances + ledger

**Files:** Create `folio/src/lib/billing/queries.ts`.

- [ ] **Step 1: Implement**
```ts
import { createClient } from "@/lib/supabase/server";

export interface Balance {
  student_id: string;
  name: string;
  charged: number;
  paid: number;
  balance: number;
}

export interface LedgerEntry {
  id: string;
  student_id: string;
  type: string;
  amount: number;
  lesson_id: string | null;
  note: string | null;
  created_at: string;
}

// Per active student: total charged, total paid, and the outstanding balance (charged - paid).
export async function listBalances(): Promise<Balance[]> {
  const supabase = await createClient();
  const [studentsRes, entriesRes] = await Promise.all([
    supabase.from("folio_students").select("id, name").is("archived_at", null).order("name", { ascending: true }),
    supabase.from("folio_student_payments").select("student_id, amount, type"),
  ]);
  if (studentsRes.error) throw new Error(`listBalances students: ${studentsRes.error.message}`);
  if (entriesRes.error) throw new Error(`listBalances entries: ${entriesRes.error.message}`);

  const agg = new Map<string, { charged: number; paid: number }>();
  for (const e of (entriesRes.data as { student_id: string; amount: number | string; type: string }[]) ?? []) {
    const a = agg.get(e.student_id) ?? { charged: 0, paid: 0 };
    if (e.type === "charge") a.charged += Number(e.amount);
    else a.paid += Number(e.amount);
    agg.set(e.student_id, a);
  }
  return ((studentsRes.data as { id: string; name: string }[]) ?? []).map((s) => {
    const a = agg.get(s.id) ?? { charged: 0, paid: 0 };
    return { student_id: s.id, name: s.name, charged: a.charged, paid: a.paid, balance: a.charged - a.paid };
  });
}

// All ledger entries (RLS-scoped), newest first — grouped per student in the UI.
export async function listLedgerEntries(): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_student_payments")
    .select("id, student_id, type, amount, lesson_id, note, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listLedgerEntries failed: ${error.message}`);
  return ((data as (LedgerEntry & { amount: number | string })[]) ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/billing/queries.ts
git commit -m "feat(folio): billing queries (balances + ledger)"
```

---

### Task 6: actions — recordPayment + deleteEntry

**Files:** Create `folio/src/lib/billing/actions.ts`.

- [ ] **Step 1: Implement**
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { paymentInputSchema, type PaymentInput } from "./schema";

export type BillingResult = { ok: true } | { ok: false; error: string };

export async function recordPayment(input: PaymentInput): Promise<BillingResult> {
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_student_payments").insert({
    workspace_id: workspaceId,
    student_id: v.studentId,
    amount: v.amount,
    type: "payment",
    note: v.note ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Delete a ledger entry (manual correction). RLS scopes deletion to the workspace.
export async function deleteEntry(id: string): Promise<BillingResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_student_payments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/billing/actions.ts
git commit -m "feat(folio): billing actions (recordPayment + deleteEntry)"
```

---

### Task 7: i18n + sidebar nav

**Files:** Modify `folio/messages/{ru,en}.json`, `folio/src/app/[locale]/(app)/AppSidebar.tsx`.

- [ ] **Step 1: Add `Billing` to `ru.json`**
```json
"Billing": {
  "title": "Деньги",
  "student": "Ученик",
  "charged": "Начислено",
  "paid": "Оплачено",
  "balance": "Остаток",
  "recordPayment": "Записать оплату",
  "amount": "Сумма",
  "note": "Заметка",
  "save": "Сохранить",
  "cancel": "Отмена",
  "saved": "Сохранено",
  "saveError": "Не удалось",
  "empty": "Учеников пока нет",
  "ledger": "История",
  "hide": "Скрыть",
  "delete": "Удалить",
  "charge": "Начисление",
  "payment": "Оплата",
  "noEntries": "Операций нет"
}
```
- [ ] **Step 2: Add the same keys to `en.json`** (English): title "Money", student "Student", charged "Charged", paid "Paid", balance "Balance", recordPayment "Record payment", amount "Amount", note "Note", save "Save", cancel "Cancel", saved "Saved", saveError "Failed", empty "No students yet", ledger "History", hide "Hide", delete "Delete", charge "Charge", payment "Payment", noEntries "No entries".
- [ ] **Step 3: Nav** — add `"billing"` to `Nav` (ru "Деньги", en "Money") and the item to `AppSidebar` NAV (read first), after homework:
```ts
const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/schedule", key: "schedule" },
  { href: "/students", key: "students" },
  { href: "/homework", key: "homework" },
  { href: "/billing", key: "billing" },
] as const;
```
- [ ] **Step 4: Build** — `cd folio && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add Folio/messages/ru.json Folio/messages/en.json "Folio/src/app/[locale]/(app)/AppSidebar.tsx"
git commit -m "feat(folio): Billing i18n + sidebar nav"
```

---

### Task 8: BalancesList (client)

**Files:** Create `folio/src/app/[locale]/(app)/billing/BalancesList.tsx`.

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordPayment, deleteEntry } from "@/lib/billing/actions";
import type { Balance, LedgerEntry } from "@/lib/billing/queries";

interface Labels {
  student: string; charged: string; paid: string; balance: string; recordPayment: string;
  amount: string; note: string; save: string; cancel: string; saved: string; saveError: string;
  empty: string; ledger: string; hide: string; delete: string; charge: string; payment: string;
  noEntries: string;
}

export function BalancesList({ balances, ledger, labels }: {
  balances: Balance[];
  ledger: LedgerEntry[];
  labels: Labels;
}) {
  const router = useRouter();
  const [payFor, setPayFor] = useState<Balance | null>(null);
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const byStudent = (id: string) => ledger.filter((e) => e.student_id === id);

  function startPay(b: Balance) { setPayFor(b); setAmount(""); setNote(""); }

  async function submitPay() {
    if (!payFor) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error(labels.saveError); return; }
    setPending(true);
    try {
      const res = await recordPayment({ studentId: payFor.student_id, amount: value, note: note.trim() || undefined });
      if (res.ok) { toast.success(labels.saved); setPayFor(null); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      const res = await deleteEntry(id);
      if (res.ok) { toast.success(labels.saved); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  if (balances.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {balances.map((b) => (
          <li key={b.student_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{b.name}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{labels.charged}: {b.charged}</span>
                <span className="text-muted-foreground">{labels.paid}: {b.paid}</span>
                <span className={b.balance > 0 ? "font-bold text-destructive" : "font-bold"}>
                  {labels.balance}: {b.balance}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenLedger(openLedger === b.student_id ? null : b.student_id)}>
                  {openLedger === b.student_id ? labels.hide : labels.ledger}
                </Button>
                <Button size="sm" onClick={() => startPay(b)}>{labels.recordPayment}</Button>
              </div>
            </div>
            {openLedger === b.student_id && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                {byStudent(b.student_id).length === 0 ? (
                  <li className="text-muted-foreground">{labels.noEntries}</li>
                ) : byStudent(b.student_id).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span>
                      {e.type === "charge" ? labels.charge : labels.payment} · {e.amount}
                      {e.note ? ` · ${e.note}` : ""} · {new Date(e.created_at).toLocaleDateString()}
                    </span>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(e.id)}>{labels.delete}</Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={payFor !== null} onOpenChange={(o) => { if (!o) setPayFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordPayment}{payFor ? ` — ${payFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-amount">{labels.amount}</Label>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-note">{labels.note}</Label>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayFor(null)} disabled={pending}>{labels.cancel}</Button>
            <Button onClick={submitPay} disabled={pending || !amount.trim()}>{labels.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/billing/BalancesList.tsx"
git commit -m "feat(folio): BalancesList — balances, record payment, ledger + delete"
```

---

### Task 9: billing page (server)

**Files:** Create `folio/src/app/[locale]/(app)/billing/page.tsx`.

- [ ] **Step 1: Implement**
```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBalances, listLedgerEntries } from "@/lib/billing/queries";
import { BalancesList } from "./BalancesList";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const [balances, ledger] = await Promise.all([listBalances(), listLedgerEntries()]);
  const t = await getTranslations("Billing");
  const labels = {
    student: t("student"), charged: t("charged"), paid: t("paid"), balance: t("balance"),
    recordPayment: t("recordPayment"), amount: t("amount"), note: t("note"), save: t("save"),
    cancel: t("cancel"), saved: t("saved"), saveError: t("saveError"), empty: t("empty"),
    ledger: t("ledger"), hide: t("hide"), delete: t("delete"), charge: t("charge"),
    payment: t("payment"), noEntries: t("noEntries"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <BalancesList balances={balances} ledger={ledger} labels={labels} />
    </main>
  );
}
```
- [ ] **Step 2: Build** — `cd folio && npm run build`. Expected: `/[locale]/billing` registered.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/billing/page.tsx"
git commit -m "feat(folio): billing page (balances)"
```

---

### Task 10: Verification + docs

- [ ] **Step 1: Full check** — `cd folio && npx tsc --noEmit && npm test && npm run build`. All pass; `/[locale]/billing` registered.
- [ ] **Step 2: RLS (SQL)** — `select policyname, cmd from pg_policies where tablename='folio_student_payments'` → `workspace_isolation`/ALL.
- [ ] **Step 3: Smoke** — `npm run dev`, log in. On `/ru/schedule`, create a lesson for the "тест" student (who has default_rate 100) and mark it «Состоялось». Open `/ru/billing`: the student shows charged 100, balance 100 (highlighted as debt). Record a payment of 100 → balance 0. Re-open the lesson on the schedule (uncheck ✓) → charge reverts (charged 0). Verify rows in `folio_student_payments`. (Also: completing again re-creates the charge once, no duplicate.)
- [ ] **Step 4: Docs** — `Folio/docs/DATA_MODEL.md` (`folio_student_payments ✅` + migration entry; mark `student_payments` draft realized), `ARCHITECTURE.md` ("Billing (M5)": ledger + auto-charge invariant in lesson actions + balances), `ROADMAP.md` (check off M5 items done; note per-lesson rate-override UI + period filters deferred; the M4 "состоялось → начисление" trigger is now implemented). Commit + push:
```bash
git add Folio/docs/DATA_MODEL.md Folio/docs/ARCHITECTURE.md Folio/docs/ROADMAP.md
git commit -m "docs(folio): document M5 Billing (ledger, auto-charge, balances)"
git push
```

---

## Self-Review

**Spec coverage:**
- `folio_student_payments` ledger + RLS → Task 1. ✓
- Auto-charge on complete; reverse on reopen/cancel (invariant) → Tasks 3, 4. ✓
- `chargeAmount` (override ?? default ?? 0) → Task 2. ✓
- Manual payment + delete-entry correction → Task 6, 8. ✓
- Balances + per-student ledger → Tasks 5, 8, 9. ✓
- Idempotent charges (unique + ignoreDuplicates) → Tasks 1, 3. ✓
- Best-effort charging (status stays source of truth) → Task 4 (try/catch + log). ✓
- workspace_id/created_by server-derived (charge ws from lesson row) → Tasks 3, 6. ✓
- i18n + nav → Task 7. ✓
- Tests (amount + schema) + RLS + smoke → Tasks 2, 10. ✓
- Docs → Task 10. ✓
- Deferred (per-lesson rate UI, period filters, charge editing, currency) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` (Task 1) explicit substitution. No vague TODOs.

**Type consistency:** `chargeAmount` (Task 2) used in charges (3); `PaymentInput`/`paymentInputSchema` (Task 2) used in actions (6); `chargeForCompletedLesson`/`reverseChargesForLesson` (Task 3) used in lesson actions (4); `Balance`/`LedgerEntry` (Task 5) used in BalancesList (8) + page (9); `recordPayment`/`deleteEntry`/`BillingResult` (Task 6) used in BalancesList (8). The supabase embed `folio_students(default_rate)` is normalized object-or-array in Task 3 (same lesson as M4/M7b). shadcn imports match installed exports.

## Notes for execution
- Migration applied to the live shared project (additive); rename local file to recorded version if applied via MCP.
- Task 4 modifies the live-relevant lesson actions but is Folio-only (no bot/deploy); charging is best-effort so a billing error never blocks a status change.
- `numeric` may arrive as string from PostgREST — `Number(...)` coercion is applied in queries (Task 5).
- Balances aggregated in JS (no DB view) — fine for MVP scale; revisit with a `security_invoker` view if data grows.
