# Folio M7b — Homework Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign a saved homework template to students (with due date + status), view assignments, and view/copy template content for manual sharing — at `/[locale]/homework`.

**Architecture:** New `folio_homework_assignments` table (workspace RLS, cross-entity with-check). Queries in `lib/homework/queries.ts`, `"use server"` mutations in `lib/homework/assignments.ts`. Client `TemplatesList` (view/copy + assign dialog) and `AssignmentsList` (status control) on the homework page. Reuses `listActiveStudents` from M4. Delivery stays manual (deferred).

**Tech Stack:** Next.js 16 (Server Actions), @supabase/ssr, zod 4, shadcn/ui (Dialog/Button/Input/Label), next-intl 4.

**Spec:** `docs/superpowers/specs/2026-06-15-folio-m7b-homework-assignment-design.md`

---

## File Structure

- `supabase/migrations/<ts>_folio_homework_assignments.sql` — table + RLS. NEW
- `folio/src/lib/homework/assignments-schema.ts` — `assignInputSchema`, `assignmentStatusSchema`, `ASSIGNMENT_STATUSES`, `AssignInput`. NEW
- `folio/src/lib/homework/__tests__/assignments-schema.test.ts` — vitest. NEW
- `folio/src/lib/homework/queries.ts` — add `listAssignments` + `AssignmentRow`. MODIFY
- `folio/src/lib/homework/assignments.ts` — `assignTemplate`, `updateAssignmentStatus` (`"use server"`). NEW
- `folio/src/app/[locale]/(app)/homework/TemplatesList.tsx` — client: view/copy + assign dialog. NEW
- `folio/src/app/[locale]/(app)/homework/AssignmentsList.tsx` — client: status control. NEW
- `folio/src/app/[locale]/(app)/homework/page.tsx` — wire templates/students/assignments. MODIFY
- `folio/messages/{ru,en}.json` — extend `Homework` namespace. MODIFY
- `Folio/docs/{DATA_MODEL,ARCHITECTURE,ROADMAP}.md` — DoD.

Conventions: TS strict, no `any` without `// reason:`. `@/*` → `folio/src/*`. Commit per task; `Folio/...` case for app files; verify `git status` after. Work on `main`. No deploy (Folio web).

---

### Task 1: Migration — `folio_homework_assignments`

**Files:** Create `supabase/migrations/<ts>_folio_homework_assignments.sql` (timestamp after `20260613213941`).

- [ ] **Step 1: Write the migration**
```sql
-- Folio M7b: homework assignments (template -> student). Workspace-scoped RLS.
create table folio_homework_assignments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  template_id  uuid not null references folio_homework_templates(id) on delete cascade,
  student_id   uuid not null references folio_students(id) on delete cascade,
  assigned_by  uuid references folio_users(id),
  due_date     date,
  status       text not null default 'assigned' check (status in ('assigned','submitted','reviewed')),
  note         text,
  assigned_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (template_id, student_id)
);
create index folio_homework_assignments_ws_tpl_idx on folio_homework_assignments (workspace_id, template_id);
create index folio_homework_assignments_student_idx on folio_homework_assignments (student_id);

alter table folio_homework_assignments enable row level security;
create policy "workspace_isolation" on folio_homework_assignments
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (
    workspace_id = folio_current_workspace_id()
    and template_id in (select id from folio_homework_templates where workspace_id = folio_current_workspace_id())
    and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id())
  );
```
- [ ] **Step 2: Apply** — `supabase db push` (or MCP `apply_migration`; rename local file to the recorded version).
- [ ] **Step 3: Verify** — `supabase db query --linked "select column_name from information_schema.columns where table_name='folio_homework_assignments' order by ordinal_position"`.
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/*_folio_homework_assignments.sql
git commit -m "feat(db): add folio_homework_assignments with workspace RLS"
```

---

### Task 2: assignments schema (TDD)

**Files:** Create `folio/src/lib/homework/assignments-schema.ts`, `folio/src/lib/homework/__tests__/assignments-schema.test.ts`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { assignInputSchema, assignmentStatusSchema } from "../assignments-schema";

const T = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-9222-222222222222";

describe("assignInputSchema", () => {
  it("accepts a valid assignment", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S] }).success).toBe(true);
  });
  it("accepts an optional due date", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S], dueDate: "2026-07-01" }).success).toBe(true);
  });
  it("rejects empty studentIds", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [] }).success).toBe(false);
  });
  it("rejects a non-uuid templateId", () => {
    expect(assignInputSchema.safeParse({ templateId: "nope", studentIds: [S] }).success).toBe(false);
  });
  it("rejects a malformed due date", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S], dueDate: "2026/07/01" }).success).toBe(false);
  });
});

describe("assignmentStatusSchema", () => {
  it("accepts known statuses", () => {
    expect(assignmentStatusSchema.safeParse("submitted").success).toBe(true);
  });
  it("rejects unknown status", () => {
    expect(assignmentStatusSchema.safeParse("done").success).toBe(false);
  });
});
```
- [ ] **Step 2: Run → FAIL** — `cd folio && npm test`.
- [ ] **Step 3: Implement `assignments-schema.ts`**
```ts
import { z } from "zod";

export const ASSIGNMENT_STATUSES = ["assigned", "submitted", "reviewed"] as const;

export const assignInputSchema = z.object({
  templateId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AssignInput = z.infer<typeof assignInputSchema>;

export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
```
- [ ] **Step 4: Run → PASS** — `npm test`.
- [ ] **Step 5: Commit**
```bash
git add Folio/src/lib/homework/assignments-schema.ts Folio/src/lib/homework/__tests__/assignments-schema.test.ts
git commit -m "feat(folio): homework assignment schema with tests"
```

---

### Task 3: queries — `listAssignments`

**Files:** Modify `folio/src/lib/homework/queries.ts`.

- [ ] **Step 1: Append to `queries.ts`** (keep the existing `listTemplates`/`TemplateRow`)
```ts
export interface AssignmentRow {
  id: string;
  status: string;
  due_date: string | null;
  student_name: string | null;
  template_topic: string | null;
  template_type: string | null;
}

interface AssignmentJoinRow {
  id: string;
  status: string;
  due_date: string | null;
  folio_students: { name: string } | { name: string }[] | null;
  folio_homework_templates: { topic: string; module_type: string } | { topic: string; module_type: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Workspace assignments (RLS-scoped) with student name + template topic/type, newest first.
export async function listAssignments(): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .select("id, status, due_date, folio_students(name), folio_homework_templates(topic, module_type)")
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(`listAssignments failed: ${error.message}`);
  return ((data as AssignmentJoinRow[]) ?? []).map((r) => {
    const student = one(r.folio_students);
    const tpl = one(r.folio_homework_templates);
    return {
      id: r.id,
      status: r.status,
      due_date: r.due_date,
      student_name: student?.name ?? null,
      template_topic: tpl?.topic ?? null,
      template_type: tpl?.module_type ?? null,
    };
  });
}
```
- [ ] **Step 2: tsc** — `cd folio && npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/homework/queries.ts
git commit -m "feat(folio): listAssignments query"
```

---

### Task 4: server actions — assign / status

**Files:** Create `folio/src/lib/homework/assignments.ts`.

- [ ] **Step 1: Implement**
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { assignInputSchema, assignmentStatusSchema, type AssignInput } from "./assignments-schema";

export type AssignResult = { ok: true } | { ok: false; error: string };

export async function assignTemplate(input: AssignInput): Promise<AssignResult> {
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };

  const v = parsed.data;
  const rows = v.studentIds.map((sid) => ({
    workspace_id: workspaceId,
    template_id: v.templateId,
    student_id: sid,
    assigned_by: user.id,
    due_date: v.dueDate ?? null,
  }));
  // Re-assigning the same template to the same student is a no-op (unique constraint).
  const { error } = await supabase
    .from("folio_homework_assignments")
    .upsert(rows, { onConflict: "template_id,student_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateAssignmentStatus(id: string, status: string): Promise<AssignResult> {
  const parsed = assignmentStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "bad status" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_homework_assignments")
    .update({ status: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/homework/assignments.ts
git commit -m "feat(folio): assignTemplate + updateAssignmentStatus actions"
```

---

### Task 5: i18n keys

**Files:** Modify `folio/messages/{ru,en}.json` (extend the existing `Homework` namespace).

- [ ] **Step 1: Add to `Homework` in `ru.json`**
```json
"view": "Просмотр",
"hide": "Скрыть",
"copy": "Копировать",
"copied": "Скопировано",
"assign": "Назначить",
"assignTitle": "Назначить ученикам",
"students": "Ученики",
"dueDate": "Срок",
"confirmAssign": "Назначить",
"cancel": "Отмена",
"assigned": "Назначено",
"pickStudents": "Выберите хотя бы одного ученика",
"assignmentsTitle": "Назначения",
"noAssignments": "Назначений пока нет",
"statusAssigned": "Назначено",
"statusSubmitted": "Сдано",
"statusReviewed": "Проверено",
"noDue": "без срока"
```
- [ ] **Step 2: Add the same keys to `en.json`** (English): view "View", hide "Hide", copy "Copy", copied "Copied", assign "Assign", assignTitle "Assign to students", students "Students", dueDate "Due", confirmAssign "Assign", cancel "Cancel", assigned "Assigned", pickStudents "Pick at least one student", assignmentsTitle "Assignments", noAssignments "No assignments yet", statusAssigned "Assigned", statusSubmitted "Submitted", statusReviewed "Reviewed", noDue "no due date".
- [ ] **Step 3: Build** — `cd folio && npm run build`.
- [ ] **Step 4: Commit**
```bash
git add Folio/messages/ru.json Folio/messages/en.json
git commit -m "feat(folio): homework assignment i18n keys"
```

---

### Task 6: TemplatesList (client — view/copy + assign dialog)

**Files:** Create `folio/src/app/[locale]/(app)/homework/TemplatesList.tsx`.

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
import { assignTemplate } from "@/lib/homework/assignments";
import type { TemplateRow } from "@/lib/homework/queries";
import type { StudentOption } from "@/lib/lessons/queries";

interface Labels {
  empty: string; templates: string; view: string; hide: string; copy: string; copied: string;
  assign: string; assignTitle: string; students: string; dueDate: string; confirmAssign: string;
  cancel: string; assigned: string; pickStudents: string; saveError: string;
  typeKey: (m: string) => string; // maps module_type -> localized label
}

export function TemplatesList({ templates, students, labels }: {
  templates: TemplateRow[];
  students: StudentOption[];
  labels: Labels;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);   // expanded content
  const [assignId, setAssignId] = useState<string | null>(null); // template being assigned
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [pending, setPending] = useState(false);

  function startAssign(id: string) { setAssignId(id); setPicked([]); setDue(""); }
  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function copy(content: string) {
    try { await navigator.clipboard.writeText(content); toast.success(labels.copied); }
    catch { toast.error(labels.saveError); }
  }

  async function confirmAssign() {
    if (!assignId) return;
    if (picked.length === 0) { toast.error(labels.pickStudents); return; }
    setPending(true);
    try {
      const res = await assignTemplate({ templateId: assignId, studentIds: picked, dueDate: due || undefined });
      if (res.ok) { toast.success(labels.assigned); setAssignId(null); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  if (templates.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {templates.map((tpl) => (
          <li key={tpl.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{tpl.topic}</span>
                <span className="text-xs text-muted-foreground">
                  {labels.typeKey(tpl.module_type)}{tpl.level ? ` · ${tpl.level}` : ""} · {new Date(tpl.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenId(openId === tpl.id ? null : tpl.id)}>
                  {openId === tpl.id ? labels.hide : labels.view}
                </Button>
                <Button size="sm" onClick={() => startAssign(tpl.id)}>{labels.assign}</Button>
              </div>
            </div>
            {openId === tpl.id && (
              <div className="mt-3 flex flex-col gap-2">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-3 font-sans text-sm">{tpl.content}</pre>
                <div><Button variant="outline" size="sm" onClick={() => copy(tpl.content)}>{labels.copy}</Button></div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={assignId !== null} onOpenChange={(o) => { if (!o) setAssignId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.assignTitle}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <span className="text-sm font-medium">{labels.students}</span>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
              {students.map((s) => (
                <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    picked.includes(s.id) ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-secondary"
                  }`}>
                  {s.name}{picked.includes(s.id) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{labels.dueDate}</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignId(null)} disabled={pending}>{labels.cancel}</Button>
            <Button onClick={confirmAssign} disabled={pending || picked.length === 0}>{labels.confirmAssign}</Button>
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
git add "Folio/src/app/[locale]/(app)/homework/TemplatesList.tsx"
git commit -m "feat(folio): TemplatesList — view/copy content + assign dialog"
```

---

### Task 7: AssignmentsList (client — status control)

**Files:** Create `folio/src/app/[locale]/(app)/homework/AssignmentsList.tsx`.

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { updateAssignmentStatus } from "@/lib/homework/assignments";
import { ASSIGNMENT_STATUSES } from "@/lib/homework/assignments-schema";
import type { AssignmentRow } from "@/lib/homework/queries";

interface Labels {
  assignmentsTitle: string; noAssignments: string; noDue: string; saveError: string;
  typeKey: (m: string) => string;
  statusLabel: (s: string) => string;
}

export function AssignmentsList({ assignments, labels }: {
  assignments: AssignmentRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await updateAssignmentStatus(id, status);
      if (res.ok) router.refresh();
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{labels.assignmentsTitle}</h2>
      {assignments.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.noAssignments}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{a.student_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {a.template_topic ?? "—"}{a.template_type ? ` · ${labels.typeKey(a.template_type)}` : ""} · {a.due_date ?? labels.noDue}
                </span>
              </div>
              <select
                className="rounded-lg border border-border bg-card px-2 py-1 text-sm"
                value={a.status}
                disabled={busyId === a.id}
                onChange={(e) => changeStatus(a.id, e.target.value)}
              >
                {ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{labels.statusLabel(s)}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/homework/AssignmentsList.tsx"
git commit -m "feat(folio): AssignmentsList — status control"
```

---

### Task 8: wire the page

**Files:** Modify `folio/src/app/[locale]/(app)/homework/page.tsx`.

- [ ] **Step 1: Replace the page** (read it first; keep the `HomeworkGenerator` block, replace the inline templates `<ul>` with the new components):
```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates, listAssignments } from "@/lib/homework/queries";
import { listActiveStudents } from "@/lib/lessons/queries";
import { HomeworkGenerator } from "./HomeworkGenerator";
import { TemplatesList } from "./TemplatesList";
import { AssignmentsList } from "./AssignmentsList";

const TYPE_KEY: Record<string, string> = {
  READING_MODULE: "typeReading",
  VOCABULARY_MODULE: "typeVocabulary",
  TRANSLATION_TEXTS: "typeTranslationTexts",
  TRANSLATION_SENTENCES: "typeTranslationSentences",
  VERB_SENTENCES: "typeVerb",
};
const STATUS_KEY: Record<string, string> = {
  assigned: "statusAssigned",
  submitted: "statusSubmitted",
  reviewed: "statusReviewed",
};

export default async function HomeworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const [templates, students, assignments] = await Promise.all([
    listTemplates(),
    listActiveStudents(),
    listAssignments(),
  ]);

  const t = await getTranslations("Homework");
  const typeKey = (m: string) => t(TYPE_KEY[m] ?? "typeReading");
  const statusLabel = (s: string) => t(STATUS_KEY[s] ?? "statusAssigned");

  const genLabels = {
    type: t("type"), topic: t("topic"), level: t("level"), age: t("age"), verb: t("verb"),
    generate: t("generate"), generating: t("generating"), result: t("result"),
    saveTemplate: t("saveTemplate"), saved: t("saved"), saveError: t("saveError"),
    typeReading: t("typeReading"), typeVocabulary: t("typeVocabulary"),
    typeTranslationTexts: t("typeTranslationTexts"), typeTranslationSentences: t("typeTranslationSentences"),
    typeVerb: t("typeVerb"), ageTeen: t("ageTeen"), ageYoung: t("ageYoung"), ageAdult: t("ageAdult"),
  };
  const tplLabels = {
    empty: t("empty"), templates: t("templates"), view: t("view"), hide: t("hide"),
    copy: t("copy"), copied: t("copied"), assign: t("assign"), assignTitle: t("assignTitle"),
    students: t("students"), dueDate: t("dueDate"), confirmAssign: t("confirmAssign"),
    cancel: t("cancel"), assigned: t("assigned"), pickStudents: t("pickStudents"),
    saveError: t("saveError"), typeKey,
  };
  const asgLabels = {
    assignmentsTitle: t("assignmentsTitle"), noAssignments: t("noAssignments"),
    noDue: t("noDue"), saveError: t("saveError"), typeKey, statusLabel,
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <HomeworkGenerator labels={genLabels} />
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t("templates")}</h2>
        <TemplatesList templates={templates} students={students} labels={tplLabels} />
      </div>
      <AssignmentsList assignments={assignments} labels={asgLabels} />
    </main>
  );
}
```
- [ ] **Step 2: Build** — `cd folio && npm run build`. Expected: `/[locale]/homework` compiles.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/homework/page.tsx"
git commit -m "feat(folio): wire homework page with templates list + assignments"
```

---

### Task 9: Verification + docs

- [ ] **Step 1: Full check** — `cd folio && npx tsc --noEmit && npm test && npm run build`. All pass.
- [ ] **Step 2: RLS (SQL)** — `select policyname, cmd from pg_policies where tablename='folio_homework_assignments'` → `workspace_isolation`/ALL.
- [ ] **Step 3: Smoke** — `npm run dev`, log in, `/ru/homework`: generate+save a template (or use an existing one), "Просмотр" shows content + "Копировать" works, "Назначить" → pick the "тест" student + a due date → toast; the assignment appears in "Назначения" with a status dropdown; change status → persists (refresh). Re-assign the same template+student → no duplicate (silently ignored). Verify rows in `folio_homework_assignments`.
- [ ] **Step 4: Docs** — `Folio/docs/DATA_MODEL.md` (`folio_homework_assignments ✅` + migration entry), `ARCHITECTURE.md` (assignment + manual-delivery note), `ROADMAP.md` (check off "Назначение домашки ученику"; note delivery M7c deferred — Telegram start-restriction + no email). Commit + push:
```bash
git add Folio/docs/DATA_MODEL.md Folio/docs/ARCHITECTURE.md Folio/docs/ROADMAP.md
git commit -m "docs(folio): document M7b homework assignment"
git push
```

---

## Self-Review

**Spec coverage:**
- `folio_homework_assignments` + RLS (cross-entity with-check) → Task 1. ✓
- Assign template → students + due date → Tasks 2,4,6. ✓
- View assignments + status change → Tasks 3,4,7. ✓
- View/copy template content (manual delivery) → Task 6. ✓
- zod (assign + status) → Task 2. ✓
- i18n → Task 5. ✓
- workspace_id/assigned_by server-derived → Task 4. ✓
- Reuse `listActiveStudents` → Task 8. ✓
- Tests + RLS + smoke → Tasks 2,9. ✓
- Docs → Task 9. ✓
- Deferred (automated delivery, student cabinet, PDF, submission) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` (Task 1) is an explicit substitution. `labels.typeKey`/`statusLabel` are functions passed from the page (Task 8) — defined, not placeholders. No vague TODOs.

**Type consistency:** `AssignInput`/`ASSIGNMENT_STATUSES`/`assignmentStatusSchema` (Task 2) used in actions (4) and AssignmentsList (7); `AssignmentRow` (Task 3) used in queries→AssignmentsList(7)→page(8); `TemplateRow` (existing) + `StudentOption` (from lessons) used in TemplatesList(6)/page(8); `assignTemplate`/`updateAssignmentStatus` consistent across 4/6/7. shadcn imports match installed exports. The embedded-shape `one()` helper handles supabase array-vs-object (same lesson learned in M4/M7a).

## Notes for execution
- Migration applied to the live shared project (additive); rename local file to recorded version if applied via MCP.
- `assignTemplate` uses `upsert(..., { onConflict: "template_id,student_id", ignoreDuplicates: true })` so re-assigning is a no-op (requires the unique constraint from Task 1).
- Delivery stays manual (deferred to M7c) — the "Просмотр"/"Копировать" affordance is how the tutor shares for now.
