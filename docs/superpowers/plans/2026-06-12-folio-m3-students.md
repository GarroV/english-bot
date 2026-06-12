# Folio M3 — Students — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace-scoped CRUD for the tutor's student roster — list, create, edit, soft-archive/restore — at `/[locale]/students`.

**Architecture:** New `folio_students` table (RLS via `folio_current_workspace_id()`). A thin server layer (`lib/students/`): zod schema, read queries, and `"use server"` actions that derive `workspace_id` from the session (never the client). Client UI (shadcn Table + Dialog form) calls the actions and `router.refresh()`es on success; `sonner` toasts report outcomes.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions), React 19, `@supabase/ssr` (request-scoped client), `zod` 4.4.3, shadcn/ui (Table, Dialog, Button, Input, Label, Sonner), next-intl 4 (ru/en).

**Spec:** `docs/superpowers/specs/2026-06-12-folio-m3-students-design.md`

---

## File Structure

- `supabase/migrations/<ts>_folio_students.sql` — table + RLS. NEW
- `folio/src/lib/students/schema.ts` — zod `studentInputSchema` + `StudentInput`. NEW
- `folio/src/lib/students/__tests__/schema.test.ts` — vitest. NEW
- `folio/src/lib/students/queries.ts` — `listStudents`, `StudentRow`. NEW
- `folio/src/lib/students/actions.ts` — create/update/archive/restore server actions. NEW
- `folio/src/app/[locale]/(app)/students/page.tsx` — server list page. NEW
- `folio/src/app/[locale]/(app)/students/StudentsTable.tsx` — client table + filter. NEW
- `folio/src/app/[locale]/(app)/students/StudentForm.tsx` — client dialog form. NEW
- `folio/src/app/[locale]/layout.tsx` — mount `<Toaster />`. MODIFY
- `folio/messages/ru.json`, `folio/messages/en.json` — `Students` namespace. MODIFY
- `Folio/docs/{DATA_MODEL,ARCHITECTURE,ROADMAP}.md` — DoD. MODIFY

Conventions: TS strict, no `any` without `// reason:`. Business logic in `lib/`, not components. `@/*` → `folio/src/*`. Commit per task with correct git case (`Folio/...` for tracked app files; verify `git status` clean after). Work on `main` (solo project — no feature branch). No deploy step (Folio web isn't deployed).

---

### Task 1: Migration — `folio_students`

**Files:** Create `supabase/migrations/<ts>_folio_students.sql` (timestamp after `20260612150019`).

- [ ] **Step 1: Write the migration**

```sql
-- Folio M3: tutor's student roster. Workspace-scoped, RLS via folio_current_workspace_id().
create table folio_students (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references folio_workspaces(id) on delete cascade,
  user_id       uuid references folio_users(id),          -- future linked account; null in M3
  name          text not null,
  email         text,
  telegram_id   bigint,
  default_rate  numeric(10,2),
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index folio_students_workspace_idx on folio_students (workspace_id);

alter table folio_students enable row level security;

-- with check is required so INSERTs are also scoped to the caller's workspace.
create policy "workspace_isolation" on folio_students
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());
```

- [ ] **Step 2: Apply** — `supabase db push` (or the controller applies via Supabase MCP `apply_migration`; if so, rename the local file to the recorded version so `migration list` stays in sync).

- [ ] **Step 3: Verify** — `supabase db query --linked "select column_name from information_schema.columns where table_name='folio_students' order by ordinal_position"`
Expected: id, workspace_id, user_id, name, email, telegram_id, default_rate, notes, archived_at, created_at, updated_at.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/*_folio_students.sql
git commit -m "feat(db): add folio_students table with workspace RLS"
```

---

### Task 2: zod schema + tests (TDD)

**Files:** Create `folio/src/lib/students/schema.ts`, `folio/src/lib/students/__tests__/schema.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { studentInputSchema } from "../schema";

describe("studentInputSchema", () => {
  it("accepts a minimal valid student (name only)", () => {
    const r = studentInputSchema.safeParse({ name: "Ann" });
    expect(r.success).toBe(true);
  });
  it("accepts full valid input", () => {
    const r = studentInputSchema.safeParse({
      name: "Ann", email: "a@b.com", telegramId: 5, defaultRate: 1500, notes: "x",
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty name", () => {
    expect(studentInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });
  it("rejects bad email", () => {
    expect(studentInputSchema.safeParse({ name: "Ann", email: "nope" }).success).toBe(false);
  });
  it("rejects negative rate", () => {
    expect(studentInputSchema.safeParse({ name: "Ann", defaultRate: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd folio && npm test` — FAIL (module `../schema` not found).

- [ ] **Step 3: Implement `schema.ts`**

```ts
import { z } from "zod";

// Validated student input. Optional fields are omitted (undefined), not empty strings —
// the form converts blanks to undefined before calling the server actions.
export const studentInputSchema = z.object({
  name: z.string().trim().min(1, "Имя обязательно"),
  email: z.string().trim().email("Некорректный email").optional(),
  telegramId: z.number().int().positive().optional(),
  defaultRate: z.number().nonnegative().optional(),
  notes: z.string().trim().optional(),
});

export type StudentInput = z.infer<typeof studentInputSchema>;
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd folio && npm test` — PASS (existing token-rules tests + 5 new).

- [ ] **Step 5: Commit**
```bash
git add Folio/src/lib/students/schema.ts Folio/src/lib/students/__tests__/schema.test.ts
git commit -m "feat(folio): add student input zod schema with tests"
```

---

### Task 3: Read queries

**Files:** Create `folio/src/lib/students/queries.ts`.

- [ ] **Step 1: Implement**

```ts
import { createClient } from "@/lib/supabase/server";

export interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  telegram_id: number | null;
  default_rate: number | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

// List students for the caller's workspace (RLS-scoped). Active only unless includeArchived.
export async function listStudents(includeArchived: boolean): Promise<StudentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("folio_students")
    .select("id, name, email, telegram_id, default_rate, notes, archived_at, created_at")
    .order("created_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`listStudents failed: ${error.message}`);
  return (data as StudentRow[]) ?? [];
}
```

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit` (no errors).
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/students/queries.ts
git commit -m "feat(folio): add listStudents query"
```

---

### Task 4: Server actions (create/update/archive/restore)

**Files:** Create `folio/src/lib/students/actions.ts`.

- [ ] **Step 1: Implement**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { studentInputSchema, type StudentInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Resolve the authenticated caller's workspace from their folio_users profile.
// workspace_id is NEVER taken from the client.
async function callerWorkspaceId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("folio_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

export async function createStudent(input: StudentInput): Promise<ActionResult> {
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const workspaceId = await callerWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { error } = await supabase.from("folio_students").insert({
    workspace_id: workspaceId,
    name: v.name,
    email: v.email ?? null,
    telegram_id: v.telegramId ?? null,
    default_rate: v.defaultRate ?? null,
    notes: v.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateStudent(id: string, input: StudentInput): Promise<ActionResult> {
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { error } = await supabase
    .from("folio_students")
    .update({
      name: v.name,
      email: v.email ?? null,
      telegram_id: v.telegramId ?? null,
      default_rate: v.defaultRate ?? null,
      notes: v.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Soft archive: hide from the active list, data kept, reversible.
export async function archiveStudent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("folio_students")
    .update({ archived_at: now, updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreStudent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { error } = await supabase
    .from("folio_students")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

(RLS scopes every update to the caller's workspace, so `.eq("id", id)` cannot touch another workspace's row.)

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit` (no errors).
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/students/actions.ts
git commit -m "feat(folio): add student server actions (create/update/archive/restore)"
```

---

### Task 5: Mount Toaster + i18n strings

**Files:** Modify `folio/src/app/[locale]/layout.tsx`, `folio/messages/ru.json`, `folio/messages/en.json`.

- [ ] **Step 1: Mount `<Toaster />`** — in `layout.tsx`, import and render it inside `<body>`, after `{children}` is wrapped. Read the file first. Add:
```tsx
import { Toaster } from "@/components/ui/sonner";
```
and inside `<NextIntlClientProvider>`, render children then `<Toaster />`:
```tsx
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
```

- [ ] **Step 2: Add `Students` namespace to `messages/ru.json`**
```json
"Students": {
  "title": "Ученики",
  "add": "Добавить ученика",
  "empty": "Учеников пока нет",
  "name": "Имя",
  "email": "Email",
  "telegram": "Telegram ID",
  "rate": "Ставка за урок",
  "notes": "Заметки",
  "created": "Добавлен",
  "actions": "Действия",
  "edit": "Изменить",
  "archive": "В архив",
  "restore": "Вернуть",
  "save": "Сохранить",
  "cancel": "Отмена",
  "newStudent": "Новый ученик",
  "editStudent": "Изменить ученика",
  "showArchived": "Показать архив",
  "showActive": "Активные",
  "archivedBadge": "в архиве",
  "saved": "Сохранено",
  "saveError": "Не удалось сохранить",
  "archivedToast": "Ученик в архиве",
  "restoredToast": "Ученик возвращён"
}
```

- [ ] **Step 3: Add the same keys to `messages/en.json`** (English values): "Students", "Add student", "No students yet", "Name", "Email", "Telegram ID", "Lesson rate", "Notes", "Added", "Actions", "Edit", "Archive", "Restore", "Save", "Cancel", "New student", "Edit student", "Show archived", "Active", "archived", "Saved", "Could not save", "Student archived", "Student restored".

- [ ] **Step 4: Build** — `cd folio && npm run build` (no errors).
- [ ] **Step 5: Commit**
```bash
git add Folio/src/app/\[locale\]/layout.tsx Folio/messages/ru.json Folio/messages/en.json
git commit -m "feat(folio): mount Toaster, add Students i18n strings"
```

---

### Task 6: StudentForm (client dialog)

**Files:** Create `folio/src/app/[locale]/(app)/students/StudentForm.tsx`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStudent, updateStudent } from "@/lib/students/actions";
import type { StudentInput } from "@/lib/students/schema";

interface StudentLike {
  id: string;
  name: string;
  email: string | null;
  telegram_id: number | null;
  default_rate: number | null;
  notes: string | null;
}

interface Labels {
  trigger: string; heading: string; name: string; email: string; telegram: string;
  rate: string; notes: string; save: string; cancel: string; saved: string; saveError: string;
}

// Convert raw form strings to a validated-shape StudentInput (blanks -> undefined).
function toInput(f: { name: string; email: string; telegram: string; rate: string; notes: string }): StudentInput {
  return {
    name: f.name.trim(),
    email: f.email.trim() || undefined,
    telegramId: f.telegram.trim() ? Number(f.telegram.trim()) : undefined,
    defaultRate: f.rate.trim() ? Number(f.rate.trim()) : undefined,
    notes: f.notes.trim() || undefined,
  };
}

export function StudentForm({ mode, student, labels }: {
  mode: "create" | "edit";
  student?: StudentLike;
  labels: Labels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: student?.name ?? "",
    email: student?.email ?? "",
    telegram: student?.telegram_id != null ? String(student.telegram_id) : "",
    rate: student?.default_rate != null ? String(student.default_rate) : "",
    notes: student?.notes ?? "",
  });

  async function submit() {
    setPending(true);
    const input = toInput(form);
    const res = mode === "create"
      ? await createStudent(input)
      : await updateStudent(student!.id, input);
    setPending(false);
    if (res.ok) {
      toast.success(labels.saved);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(`${labels.saveError}: ${res.error}`);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={mode === "create" ? "default" : "outline"} size="sm">{labels.trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels.heading}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-name">{labels.name}</Label>
            <Input id="st-name" value={form.name} onChange={set("name")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-email">{labels.email}</Label>
            <Input id="st-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-tg">{labels.telegram}</Label>
            <Input id="st-tg" inputMode="numeric" value={form.telegram} onChange={set("telegram")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-rate">{labels.rate}</Label>
            <Input id="st-rate" inputMode="decimal" value={form.rate} onChange={set("rate")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-notes">{labels.notes}</Label>
            <Input id="st-notes" value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{labels.cancel}</Button>
          <Button onClick={submit} disabled={pending || !form.name.trim()}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit`. If `Button`'s `variant`/`size` prop names differ from the installed shadcn button, adjust to the installed API (do not add `any`).
- [ ] **Step 3: Commit**
```bash
git add Folio/src/app/\[locale\]/\(app\)/students/StudentForm.tsx
git commit -m "feat(folio): add StudentForm dialog (create/edit)"
```

---

### Task 7: StudentsTable (client)

**Files:** Create `folio/src/app/[locale]/(app)/students/StudentsTable.tsx`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StudentForm } from "./StudentForm";
import { archiveStudent, restoreStudent } from "@/lib/students/actions";
import type { StudentRow } from "@/lib/students/queries";

interface Labels {
  add: string; empty: string; name: string; email: string; telegram: string; rate: string;
  created: string; actions: string; edit: string; archive: string; restore: string;
  save: string; cancel: string; notes: string; newStudent: string; editStudent: string;
  showArchived: string; showActive: string; archivedBadge: string;
  saved: string; saveError: string; archivedToast: string; restoredToast: string;
}

export function StudentsTable({ students, includeArchived, labels }: {
  students: StudentRow[];
  includeArchived: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const formLabels = {
    name: labels.name, email: labels.email, telegram: labels.telegram, rate: labels.rate,
    notes: labels.notes, save: labels.save, cancel: labels.cancel,
    saved: labels.saved, saveError: labels.saveError,
  };

  async function onArchive(id: string, archived: boolean) {
    setBusyId(id);
    const res = archived ? await restoreStudent(id) : await archiveStudent(id);
    setBusyId(null);
    if (res.ok) {
      toast.success(archived ? labels.restoredToast : labels.archivedToast);
      router.refresh();
    } else {
      toast.error(`${labels.saveError}: ${res.error}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <StudentForm mode="create" labels={{ ...formLabels, trigger: labels.add, heading: labels.newStudent }} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(includeArchived ? "/students" : "/students?archived=1")}
        >
          {includeArchived ? labels.showActive : labels.showArchived}
        </Button>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-zinc-500">{labels.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.name}</TableHead>
              <TableHead>{labels.email}</TableHead>
              <TableHead>{labels.telegram}</TableHead>
              <TableHead>{labels.rate}</TableHead>
              <TableHead className="text-right">{labels.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => {
              const archived = s.archived_at != null;
              return (
                <TableRow key={s.id} className={archived ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {s.name}{archived ? ` (${labels.archivedBadge})` : ""}
                  </TableCell>
                  <TableCell>{s.email ?? "—"}</TableCell>
                  <TableCell>{s.telegram_id ?? "—"}</TableCell>
                  <TableCell>{s.default_rate ?? "—"}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <StudentForm
                      mode="edit"
                      student={s}
                      labels={{ ...formLabels, trigger: labels.edit, heading: labels.editStudent }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === s.id}
                      onClick={() => onArchive(s.id, archived)}
                    >
                      {archived ? labels.restore : labels.archive}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit` (no errors).
- [ ] **Step 3: Commit**
```bash
git add Folio/src/app/\[locale\]/\(app\)/students/StudentsTable.tsx
git commit -m "feat(folio): add StudentsTable with archive filter + row actions"
```

---

### Task 8: Students page (server) + wiring

**Files:** Create `folio/src/app/[locale]/(app)/students/page.tsx`.

- [ ] **Step 1: Implement**

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudents } from "@/lib/students/queries";
import { StudentsTable } from "./StudentsTable";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const students = await listStudents(includeArchived);

  const t = await getTranslations("Students");
  const labels = {
    add: t("add"), empty: t("empty"), name: t("name"), email: t("email"),
    telegram: t("telegram"), rate: t("rate"), notes: t("notes"), created: t("created"),
    actions: t("actions"), edit: t("edit"), archive: t("archive"), restore: t("restore"),
    save: t("save"), cancel: t("cancel"), newStudent: t("newStudent"), editStudent: t("editStudent"),
    showArchived: t("showArchived"), showActive: t("showActive"), archivedBadge: t("archivedBadge"),
    saved: t("saved"), saveError: t("saveError"),
    archivedToast: t("archivedToast"), restoredToast: t("restoredToast"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <StudentsTable students={students} includeArchived={includeArchived} labels={labels} />
    </main>
  );
}
```

- [ ] **Step 2: Build** — `cd folio && npm run build`. Expected: `/[locale]/students` appears in the route list.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/app/\[locale\]/\(app\)/students/page.tsx
git commit -m "feat(folio): add students list page (server)"
```

---

### Task 9: Verification (build, RLS, smoke)

**Files:** none.

- [ ] **Step 1: Full check** — `cd folio && npx tsc --noEmit && npm test && npm run build`. All pass; `/[locale]/students` registered.

- [ ] **Step 2: RLS isolation (SQL)** — confirm the policy + that a row is scoped. Run via `supabase db query --linked` (or Supabase MCP):
```sql
select polname, cmd from pg_policies where tablename = 'folio_students';
```
Expected: a `workspace_isolation` policy for `ALL`.

- [ ] **Step 3: Smoke** — `cd folio && npm run dev`; log in (Telegram, as in M2a); open `/ru/students`; add a student → it appears; edit → changes persist; archive → leaves the active list; toggle "Показать архив" → archived student shown with badge; restore → back in active list. Verify a row exists in `folio_students` with the seeded workspace_id.

- [ ] **Step 4:** Note results. If any step fails, fix before docs.

---

### Task 10: Documentation (DoD)

**Files:** Modify `Folio/docs/DATA_MODEL.md`, `Folio/docs/ARCHITECTURE.md`, `Folio/docs/ROADMAP.md`.

- [ ] **Step 1: `DATA_MODEL.md`** — add `### folio_students ✅` with the columns from Task 1; add the migration to "Применённые миграции"; note workspace RLS + soft archive (`archived_at`).
- [ ] **Step 2: `ARCHITECTURE.md`** — add a "Students module (M3)" section: `lib/students/` (schema/queries/actions), `(app)/students` UI, server-derived `workspace_id`, RLS, soft archive.
- [ ] **Step 3: `ROADMAP.md`** — under M3 mark done: list, create/edit profile, default rate, archive. Note PII-scrub/"forget" deferred; student login deferred.
- [ ] **Step 4: Commit + push**
```bash
git add Folio/docs/DATA_MODEL.md Folio/docs/ARCHITECTURE.md Folio/docs/ROADMAP.md
git commit -m "docs(folio): document M3 Students (DATA_MODEL, ARCHITECTURE, ROADMAP)"
git push
```

---

## Self-Review

**Spec coverage:**
- `folio_students` table + workspace RLS → Task 1. ✓
- List (active default + archived filter) → Tasks 3, 7, 8. ✓
- Create/edit profile → Tasks 4, 6. ✓
- Default rate / optional fields → Tasks 2, 4, 6. ✓
- Soft archive + restore → Task 4 (archive/restore actions), Task 7 (UI). ✓
- zod validation at boundary → Tasks 2, 4. ✓
- workspace_id server-derived, never client → Task 4 (`callerWorkspaceId`). ✓
- Toasts (sonner) → Tasks 5 (mount), 6/7 (use). ✓
- i18n ru/en → Task 5. ✓
- Tests (zod) + RLS check → Tasks 2, 9. ✓
- Docs DoD → Task 10. ✓
- Deferred (student login, PII scrub) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` in Task 1 is an explicit timestamp substitution with instructions, not a vague TODO. No "add validation"-style gaps.

**Type consistency:** `StudentInput` (Task 2) consumed by actions (Task 4) and form (Task 6); `StudentRow` (Task 3) consumed by table (Task 7) and page (Task 8); `ActionResult` returned by all actions and checked in UI; `studentInputSchema` shared by schema tests + actions. Action names `createStudent/updateStudent/archiveStudent/restoreStudent` consistent across Tasks 4/6/7. shadcn component names match the installed exports (Table*, Dialog*, Button, Input, Label, Toaster).

## Notes for execution
- Migration applied to the live shared project (additive, safe); rename local file to the recorded version if applied via MCP.
- `Button` `variant`/`size` props: adjust to the installed shadcn button API if they differ (Task 6 Step 2).
- No deploy step — Folio web isn't deployed yet; `git push` only.
