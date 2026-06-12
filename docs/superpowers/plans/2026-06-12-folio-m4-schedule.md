# Folio M4 — Schedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly calendar of lessons at `/[locale]/schedule` — create (solo/group), reschedule, cancel, mark completed.

**Architecture:** New `folio_lessons` + `folio_lesson_students` (m2m) tables with workspace RLS. A thin `lib/lessons/` server layer (zod schema, pure week/type helpers, queries, `"use server"` actions deriving `workspace_id` from the session). A custom CSS week grid (no calendar library): clickable hour cells create lessons; positioned event blocks open an edit/actions dialog. `router.refresh()` after mutations; sonner toasts.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions), React 19, `@supabase/ssr`, zod 4, shadcn/ui (Dialog, Button, Input, Label), next-intl 4. Browser-local time.

**Spec:** `docs/superpowers/specs/2026-06-12-folio-m4-schedule-design.md`

---

## File Structure

- `supabase/migrations/<ts>_folio_lessons.sql` — tables + enums + RLS. NEW
- `folio/src/lib/lessons/schema.ts` — zod `lessonInputSchema`, `lessonTypeFor`, `LessonInput`. NEW
- `folio/src/lib/lessons/__tests__/schema.test.ts` — vitest. NEW
- `folio/src/lib/lessons/week.ts` — `startOfWeek`, `weekRange`, `toDatetimeLocal`, `fromDatetimeLocal`. NEW
- `folio/src/lib/lessons/__tests__/week.test.ts` — vitest. NEW
- `folio/src/lib/lessons/queries.ts` — `listLessonsInRange`, `listActiveStudents`, types `LessonWithStudents`/`StudentOption`. NEW
- `folio/src/lib/lessons/actions.ts` — create/update/cancel/complete. NEW
- `folio/src/app/[locale]/(app)/schedule/page.tsx` — server page. NEW
- `folio/src/app/[locale]/(app)/schedule/ScheduleBoard.tsx` — client week grid. NEW
- `folio/src/app/[locale]/(app)/schedule/LessonDialog.tsx` — client create/edit dialog. NEW
- `folio/src/app/[locale]/(app)/AppSidebar.tsx` — add Schedule nav item. MODIFY
- `folio/messages/ru.json`, `folio/messages/en.json` — `Schedule` namespace. MODIFY
- `Folio/docs/{DATA_MODEL,ARCHITECTURE,ROADMAP}.md` — DoD. MODIFY

Conventions: TS strict, no `any` without `// reason:`. Logic in `lib/`. `@/*` → `folio/src/*`. Commit per task; stage tracked app files with the `Folio/...` case and verify `git status` clean after. Work on `main`. No deploy step.

---

### Task 1: Migration — lessons + lesson_students

**Files:** Create `supabase/migrations/<ts>_folio_lessons.sql` (timestamp after `20260612181221`).

- [ ] **Step 1: Write the migration**

```sql
-- Folio M4: lessons (solo/group) + roster m2m. Workspace-scoped RLS.
create type folio_lesson_type as enum ('solo', 'group');
create type folio_lesson_status as enum ('scheduled', 'completed', 'cancelled');
create type folio_location_type as enum ('online', 'offline');

create table folio_lessons (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references folio_workspaces(id) on delete cascade,
  type           folio_lesson_type not null,
  scheduled_at   timestamptz not null,
  duration_min   int not null default 60,
  status         folio_lesson_status not null default 'scheduled',
  location_type  folio_location_type not null default 'online',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index folio_lessons_ws_time_idx on folio_lessons (workspace_id, scheduled_at);

create table folio_lesson_students (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null references folio_lessons(id) on delete cascade,
  student_id     uuid not null references folio_students(id) on delete cascade,
  rate_override  numeric(10,2),
  amount_charged numeric(10,2),
  created_at     timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index folio_lesson_students_lesson_idx on folio_lesson_students (lesson_id);

alter table folio_lessons enable row level security;
alter table folio_lesson_students enable row level security;

create policy "workspace_isolation" on folio_lessons
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());

-- join table scoped through its parent lesson's workspace
create policy "workspace_isolation" on folio_lesson_students
  for all
  using (lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id()))
  with check (lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id()));
```

- [ ] **Step 2: Apply** — `supabase db push` (or controller via Supabase MCP `apply_migration`; if MCP, rename local file to the recorded version to keep `migration list` in sync).

- [ ] **Step 3: Verify**
Run: `supabase db query --linked "select table_name from information_schema.tables where table_name in ('folio_lessons','folio_lesson_students')"`
Expected: both tables listed.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/*_folio_lessons.sql
git commit -m "feat(db): add folio_lessons + folio_lesson_students with workspace RLS"
```

---

### Task 2: zod schema + lessonTypeFor (TDD)

**Files:** Create `folio/src/lib/lessons/schema.ts`, `folio/src/lib/lessons/__tests__/schema.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { lessonInputSchema, lessonTypeFor } from "../schema";

const valid = {
  scheduledAt: "2026-06-15T10:00:00.000Z",
  durationMin: 60,
  locationType: "online" as const,
  studentIds: ["s1"],
};

describe("lessonInputSchema", () => {
  it("accepts a valid solo lesson", () => {
    expect(lessonInputSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts multiple students (group)", () => {
    expect(lessonInputSchema.safeParse({ ...valid, studentIds: ["s1", "s2"] }).success).toBe(true);
  });
  it("rejects empty studentIds", () => {
    expect(lessonInputSchema.safeParse({ ...valid, studentIds: [] }).success).toBe(false);
  });
  it("rejects non-positive duration", () => {
    expect(lessonInputSchema.safeParse({ ...valid, durationMin: 0 }).success).toBe(false);
  });
  it("rejects bad location", () => {
    expect(lessonInputSchema.safeParse({ ...valid, locationType: "zoom" }).success).toBe(false);
  });
});

describe("lessonTypeFor", () => {
  it("solo for one student", () => { expect(lessonTypeFor(["a"])).toBe("solo"); });
  it("group for two+", () => { expect(lessonTypeFor(["a", "b"])).toBe("group"); });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd folio && npm test` → FAIL (module not found).

- [ ] **Step 3: Implement `schema.ts`**

```ts
import { z } from "zod";

export const lessonInputSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().min(1).max(600),
  locationType: z.enum(["online", "offline"]),
  studentIds: z.array(z.string().min(1)).min(1),
  notes: z.string().trim().optional(),
});

export type LessonInput = z.infer<typeof lessonInputSchema>;

// Lesson type is derived from roster size: one student = solo, several = group.
export function lessonTypeFor(studentIds: readonly string[]): "solo" | "group" {
  return studentIds.length > 1 ? "group" : "solo";
}
```

- [ ] **Step 4: Run to verify it passes** — `cd folio && npm test` → PASS (7 new + existing).

- [ ] **Step 5: Commit**
```bash
git add Folio/src/lib/lessons/schema.ts Folio/src/lib/lessons/__tests__/schema.test.ts
git commit -m "feat(folio): add lesson input schema + type derivation with tests"
```

---

### Task 3: week helpers (TDD)

**Files:** Create `folio/src/lib/lessons/week.ts`, `folio/src/lib/lessons/__tests__/week.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { startOfWeek, weekRange, toDatetimeLocal } from "../week";

describe("startOfWeek", () => {
  it("returns the Monday for a mid-week date", () => {
    // 2026-06-12 is a Friday
    const mon = startOfWeek(new Date("2026-06-12T15:00:00"));
    expect(mon.getDay()).toBe(1); // Monday
    expect(mon.getHours()).toBe(0);
  });
  it("returns the Monday itself for a Monday", () => {
    const mon = startOfWeek(new Date("2026-06-08T09:00:00")); // Monday
    expect(mon.getDay()).toBe(1);
  });
  it("handles Sunday (goes back to previous Monday)", () => {
    const mon = startOfWeek(new Date("2026-06-14T09:00:00")); // Sunday
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(8);
  });
});

describe("weekRange", () => {
  it("spans exactly 7 days", () => {
    const { fromISO, toISO } = weekRange(new Date("2026-06-08T00:00:00"));
    const days = (Date.parse(toISO) - Date.parse(fromISO)) / 86400000;
    expect(days).toBe(7);
  });
});

describe("toDatetimeLocal", () => {
  it("formats to YYYY-MM-DDTHH:mm", () => {
    expect(toDatetimeLocal(new Date("2026-06-15T09:05:00"))).toBe("2026-06-15T09:05");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test` → FAIL.

- [ ] **Step 3: Implement `week.ts`**

```ts
// Monday 00:00 (local) of the week containing `d`.
export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// [Monday 00:00, next Monday 00:00) as ISO strings for range queries.
export function weekRange(monday: Date): { fromISO: string; toISO: string } {
  const from = new Date(monday);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

// Local Date -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">.
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DDTHH:mm" (local) -> ISO (UTC) string.
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

// "YYYY-MM-DD" (Monday date param) -> Date, or current week's Monday if absent/invalid.
export function mondayFromParam(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(`${param}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfWeek(d);
  }
  return startOfWeek(new Date());
}

// Date -> "YYYY-MM-DD" for the ?week= param.
export function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add Folio/src/lib/lessons/week.ts Folio/src/lib/lessons/__tests__/week.test.ts
git commit -m "feat(folio): add week/date helpers with tests"
```

---

### Task 4: queries

**Files:** Create `folio/src/lib/lessons/queries.ts`.

- [ ] **Step 1: Implement**

```ts
import { createClient } from "@/lib/supabase/server";

export interface StudentOption {
  id: string;
  name: string;
}

export interface LessonWithStudents {
  id: string;
  type: "solo" | "group";
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "completed" | "cancelled";
  location_type: "online" | "offline";
  notes: string | null;
  students: StudentOption[];
}

interface LessonRow {
  id: string;
  type: "solo" | "group";
  scheduled_at: string;
  duration_min: number;
  status: "scheduled" | "completed" | "cancelled";
  location_type: "online" | "offline";
  notes: string | null;
  folio_lesson_students: { folio_students: StudentOption | null }[] | null;
}

// Lessons whose scheduled_at is within [fromISO, toISO), with each lesson's students.
export async function listLessonsInRange(fromISO: string, toISO: string): Promise<LessonWithStudents[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_lessons")
    .select(
      "id, type, scheduled_at, duration_min, status, location_type, notes, folio_lesson_students(folio_students(id, name))",
    )
    .gte("scheduled_at", fromISO)
    .lt("scheduled_at", toISO)
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(`listLessonsInRange failed: ${error.message}`);

  return ((data as LessonRow[]) ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    scheduled_at: row.scheduled_at,
    duration_min: row.duration_min,
    status: row.status,
    location_type: row.location_type,
    notes: row.notes,
    students: (row.folio_lesson_students ?? [])
      .map((ls) => ls.folio_students)
      .filter((s): s is StudentOption => s !== null),
  }));
}

// Active (non-archived) students for the lesson picker.
export async function listActiveStudents(): Promise<StudentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folio_students")
    .select("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(`listActiveStudents failed: ${error.message}`);
  return (data as StudentOption[]) ?? [];
}
```

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/lessons/queries.ts
git commit -m "feat(folio): add lesson queries (range + active students)"
```

---

### Task 5: server actions

**Files:** Create `folio/src/lib/lessons/actions.ts`.

- [ ] **Step 1: Implement**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { lessonInputSchema, lessonTypeFor, type LessonInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

// Create a lesson and its roster. If the roster insert fails, the lesson is removed
// so we never leave a studentless lesson behind.
export async function createLesson(input: LessonInput): Promise<ActionResult> {
  const parsed = lessonInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };

  const supabase = await createClient();
  const workspaceId = await callerWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "not authenticated" };

  const v = parsed.data;
  const { data: lesson, error: insErr } = await supabase
    .from("folio_lessons")
    .insert({
      workspace_id: workspaceId,
      type: lessonTypeFor(v.studentIds),
      scheduled_at: v.scheduledAt,
      duration_min: v.durationMin,
      location_type: v.locationType,
      notes: v.notes ?? null,
    })
    .select("id")
    .single();
  if (insErr || !lesson) return { ok: false, error: insErr?.message ?? "create failed" };

  const rows = v.studentIds.map((sid) => ({ lesson_id: lesson.id, student_id: sid }));
  const { error: rosterErr } = await supabase.from("folio_lesson_students").insert(rows);
  if (rosterErr) {
    await supabase.from("folio_lessons").delete().eq("id", lesson.id);
    return { ok: false, error: rosterErr.message };
  }
  return { ok: true };
}

// Edit/reschedule: time, duration, location, notes. (Roster edits are out of M4 scope.)
export async function updateLesson(
  id: string,
  fields: { scheduledAt: string; durationMin: number; locationType: "online" | "offline"; notes?: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data, error } = await supabase
    .from("folio_lessons")
    .update({
      scheduled_at: fields.scheduledAt,
      duration_min: fields.durationMin,
      location_type: fields.locationType,
      notes: fields.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

async function setStatus(id: string, status: "completed" | "cancelled"): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_lessons")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}

// Mark completed (M5 billing / M6 journal hooks come later).
export async function completeLesson(id: string): Promise<ActionResult> {
  return setStatus(id, "completed");
}

export async function cancelLesson(id: string): Promise<ActionResult> {
  return setStatus(id, "cancelled");
}
```

- [ ] **Step 2: Type-check** — `cd folio && npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add Folio/src/lib/lessons/actions.ts
git commit -m "feat(folio): add lesson server actions (create/update/cancel/complete)"
```

---

### Task 6: i18n + sidebar nav

**Files:** Modify `folio/messages/ru.json`, `folio/messages/en.json`, `folio/src/app/[locale]/(app)/AppSidebar.tsx`.

- [ ] **Step 1: Add `Schedule` namespace to `ru.json`**
```json
"Schedule": {
  "title": "Расписание",
  "today": "Сегодня",
  "prev": "Назад",
  "next": "Вперёд",
  "newLesson": "Новое занятие",
  "editLesson": "Занятие",
  "datetime": "Дата и время",
  "duration": "Длительность (мин)",
  "location": "Формат",
  "online": "Онлайн",
  "offline": "Офлайн",
  "students": "Ученики",
  "notes": "Заметки",
  "save": "Сохранить",
  "cancel": "Отмена",
  "reschedule": "Сохранить",
  "cancelLesson": "Отменить занятие",
  "complete": "Состоялось",
  "statusScheduled": "Запланировано",
  "statusCompleted": "Состоялось",
  "statusCancelled": "Отменено",
  "group": "Группа",
  "noStudents": "Сначала добавьте учеников",
  "saved": "Сохранено",
  "saveError": "Не удалось сохранить",
  "pickStudents": "Выберите хотя бы одного ученика"
}
```

- [ ] **Step 2: Add the same keys to `en.json`** (English): "Schedule", "Today", "Back", "Next", "New lesson", "Lesson", "Date & time", "Duration (min)", "Format", "Online", "Offline", "Students", "Notes", "Save", "Cancel", "Save", "Cancel lesson", "Completed", "Scheduled", "Completed", "Cancelled", "Group", "Add students first", "Saved", "Could not save", "Pick at least one student".

- [ ] **Step 3: Add the nav item** — in `AppSidebar.tsx`, extend `NAV` (read the file first):
```ts
const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/schedule", key: "schedule" },
  { href: "/students", key: "students" },
] as const;
```
And add `"schedule": "Расписание"` (ru) / `"Schedule"` (en) to the existing `Nav` namespace in both message files.

- [ ] **Step 4: Build** — `cd folio && npm run build` (no errors).
- [ ] **Step 5: Commit**
```bash
git add Folio/messages/ru.json Folio/messages/en.json "Folio/src/app/[locale]/(app)/AppSidebar.tsx"
git commit -m "feat(folio): Schedule i18n + sidebar nav item"
```

---

### Task 7: LessonDialog (client)

**Files:** Create `folio/src/app/[locale]/(app)/schedule/LessonDialog.tsx`.

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
import { createLesson, updateLesson, cancelLesson, completeLesson } from "@/lib/lessons/actions";
import { fromDatetimeLocal } from "@/lib/lessons/week";
import type { StudentOption, LessonWithStudents } from "@/lib/lessons/queries";

export interface LessonDialogState {
  mode: "create" | "edit";
  datetimeLocal: string; // "YYYY-MM-DDTHH:mm"
  lesson?: LessonWithStudents;
}

interface Labels {
  newLesson: string; editLesson: string; datetime: string; duration: string;
  location: string; online: string; offline: string; students: string; notes: string;
  save: string; cancel: string; cancelLesson: string; complete: string;
  saved: string; saveError: string; pickStudents: string;
}

export function LessonDialog({
  state, onClose, students, labels,
}: {
  state: LessonDialogState | null;
  onClose: () => void;
  students: StudentOption[];
  labels: Labels;
}) {
  const router = useRouter();
  const open = state !== null;
  const editing = state?.mode === "edit";
  const [pending, setPending] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState<"online" | "offline">("online");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  // Re-seed the form whenever a new dialog state opens.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = state ? `${state.mode}:${state.lesson?.id ?? state.datetimeLocal}` : null;
  if (open && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setDatetime(state.datetimeLocal);
    setDuration(String(state.lesson?.duration_min ?? 60));
    setLocation(state.lesson?.location_type ?? "online");
    setNotes(state.lesson?.notes ?? "");
    setPicked(state.lesson ? state.lesson.students.map((s) => s.id) : []);
  }

  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function submit() {
    if (!state) return;
    setPending(true);
    let res;
    if (state.mode === "create") {
      if (picked.length === 0) { setPending(false); toast.error(labels.pickStudents); return; }
      res = await createLesson({
        scheduledAt: fromDatetimeLocal(datetime),
        durationMin: Number(duration),
        locationType: location,
        studentIds: picked,
        notes: notes.trim() || undefined,
      });
    } else {
      res = await updateLesson(state.lesson!.id, {
        scheduledAt: fromDatetimeLocal(datetime),
        durationMin: Number(duration),
        locationType: location,
        notes: notes.trim() || undefined,
      });
    }
    setPending(false);
    if (res.ok) { toast.success(labels.saved); onClose(); router.refresh(); }
    else toast.error(`${labels.saveError}: ${res.error}`);
  }

  async function runAction(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    if (!state?.lesson) return;
    setPending(true);
    const res = await fn(state.lesson.id);
    setPending(false);
    if (res.ok) { toast.success(labels.saved); onClose(); router.refresh(); }
    else toast.error(`${labels.saveError}: ${res.error ?? ""}`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? labels.editLesson : labels.newLesson}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-dt">{labels.datetime}</Label>
            <Input id="ls-dt" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-dur">{labels.duration}</Label>
            <Input id="ls-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{labels.location}</span>
            <div className="flex gap-2">
              {(["online", "offline"] as const).map((loc) => (
                <Button key={loc} type="button" size="sm"
                  variant={location === loc ? "default" : "outline"}
                  onClick={() => setLocation(loc)}>
                  {loc === "online" ? labels.online : labels.offline}
                </Button>
              ))}
            </div>
          </div>
          {!editing && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{labels.students}</span>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {students.map((s) => (
                  <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      picked.includes(s.id) ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-secondary"
                    }`}>
                    {s.name}{picked.includes(s.id) ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          {editing && (
            <p className="text-sm text-muted-foreground">
              {labels.students}: {state?.lesson?.students.map((s) => s.name).join(", ") || "—"}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-notes">{labels.notes}</Label>
            <Input id="ls-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {editing && (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => runAction(cancelLesson)}>
                {labels.cancelLesson}
              </Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => runAction(completeLesson)}>
                {labels.complete}
              </Button>
            </>
          )}
          <Button variant="ghost" disabled={pending} onClick={onClose}>{labels.cancel}</Button>
          <Button disabled={pending || !datetime} onClick={submit}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`. Adjust `Button` props if the installed shadcn button differs; no `any`.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/schedule/LessonDialog.tsx"
git commit -m "feat(folio): add LessonDialog (create/edit/cancel/complete)"
```

---

### Task 8: ScheduleBoard (client week grid)

**Files:** Create `folio/src/app/[locale]/(app)/schedule/ScheduleBoard.tsx`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LessonDialog, type LessonDialogState } from "./LessonDialog";
import { toDatetimeLocal, toDateParam } from "@/lib/lessons/week";
import type { LessonWithStudents, StudentOption } from "@/lib/lessons/queries";

const DAY_START = 7;   // 07:00
const DAY_END = 22;    // 22:00
const HOUR_PX = 56;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface Labels {
  today: string; group: string; noStudents: string;
  dialog: React.ComponentProps<typeof LessonDialog>["labels"];
}

// dayIndex 0=Mon..6=Sun
function localDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function ScheduleBoard({
  weekStartISO, lessons, students, labels,
}: {
  weekStartISO: string; // Monday 00:00 ISO
  lessons: LessonWithStudents[];
  students: StudentOption[];
  labels: Labels;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<LessonDialogState | null>(null);
  const weekStart = new Date(weekStartISO);

  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function gotoWeek(offsetDays: number) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + offsetDays);
    router.push(`/schedule?week=${toDateParam(d)}`);
  }
  function gotoToday() { router.push("/schedule"); }

  function openCreate(dayIdx: number, hour: number) {
    if (students.length === 0) return;
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dayIdx);
    d.setHours(hour, 0, 0, 0);
    setDialog({ mode: "create", datetimeLocal: toDatetimeLocal(d) });
  }
  function openEdit(lesson: LessonWithStudents) {
    setDialog({ mode: "edit", datetimeLocal: toDatetimeLocal(new Date(lesson.scheduled_at)), lesson });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => gotoWeek(-7)}>←</Button>
        <Button variant="outline" size="sm" onClick={gotoToday}>{labels.today}</Button>
        <Button variant="outline" size="sm" onClick={() => gotoWeek(7)}>→</Button>
        <span className="ml-2 font-semibold">
          {dayDates[0].toLocaleDateString()} — {dayDates[6].toLocaleDateString()}
        </span>
      </div>

      {students.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          {labels.noStudents}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          {/* header */}
          <div className="border-b border-border" />
          {dayDates.map((d, i) => (
            <div key={i} className="border-b border-l border-border p-2 text-center text-sm font-semibold">
              {DAY_NAMES[i]} {d.getDate()}
            </div>
          ))}

          {/* hour gutter */}
          <div>
            {HOURS.map((h) => (
              <div key={h} className="border-b border-border pr-1 text-right text-xs text-muted-foreground"
                style={{ height: HOUR_PX }}>
                {h}:00
              </div>
            ))}
          </div>

          {/* day columns */}
          {dayDates.map((_, dayIdx) => {
            const dayLessons = lessons.filter((l) => localDayIndex(new Date(l.scheduled_at)) === dayIdx);
            return (
              <div key={dayIdx} className="relative border-l border-border">
                {HOURS.map((h) => (
                  <button key={h} type="button" onClick={() => openCreate(dayIdx, h)}
                    className="block w-full border-b border-border transition-colors hover:bg-secondary/50"
                    style={{ height: HOUR_PX }} aria-label={`${DAY_NAMES[dayIdx]} ${h}:00`} />
                ))}
                <div className="pointer-events-none absolute inset-0">
                  {dayLessons.map((l) => {
                    const start = new Date(l.scheduled_at);
                    const minutes = start.getHours() * 60 + start.getMinutes() - DAY_START * 60;
                    const top = Math.max(0, (minutes / 60) * HOUR_PX);
                    const height = Math.max(20, (l.duration_min / 60) * HOUR_PX - 2);
                    const cancelled = l.status === "cancelled";
                    const completed = l.status === "completed";
                    const title = l.type === "group" ? `${labels.group} (${l.students.length})` : (l.students[0]?.name ?? "—");
                    return (
                      <button key={l.id} type="button" onClick={() => openEdit(l)}
                        className={`pointer-events-auto absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs shadow-sm transition ${
                          cancelled
                            ? "border-border bg-muted text-muted-foreground line-through"
                            : completed
                              ? "border-border bg-secondary text-muted-foreground"
                              : "border-primary/30 bg-accent text-accent-foreground"
                        }`}
                        style={{ top, height }}>
                        <span className="font-semibold">
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {completed ? " ✓" : ""}
                        </span>
                        <br />
                        {title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LessonDialog state={dialog} onClose={() => setDialog(null)} students={students} labels={labels.dialog} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/schedule/ScheduleBoard.tsx"
git commit -m "feat(folio): add ScheduleBoard week grid"
```

---

### Task 9: schedule page (server)

**Files:** Create `folio/src/app/[locale]/(app)/schedule/page.tsx`.

- [ ] **Step 1: Implement**

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listLessonsInRange, listActiveStudents } from "@/lib/lessons/queries";
import { mondayFromParam, weekRange } from "@/lib/lessons/week";
import { ScheduleBoard } from "./ScheduleBoard";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const { week } = await searchParams;
  const monday = mondayFromParam(week);
  const { fromISO, toISO } = weekRange(monday);
  const [lessons, students] = await Promise.all([
    listLessonsInRange(fromISO, toISO),
    listActiveStudents(),
  ]);

  const t = await getTranslations("Schedule");
  const labels = {
    today: t("today"), group: t("group"), noStudents: t("noStudents"),
    dialog: {
      newLesson: t("newLesson"), editLesson: t("editLesson"), datetime: t("datetime"),
      duration: t("duration"), location: t("location"), online: t("online"), offline: t("offline"),
      students: t("students"), notes: t("notes"), save: t("save"), cancel: t("cancel"),
      cancelLesson: t("cancelLesson"), complete: t("complete"),
      saved: t("saved"), saveError: t("saveError"), pickStudents: t("pickStudents"),
    },
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <ScheduleBoard
        weekStartISO={monday.toISOString()}
        lessons={lessons}
        students={students}
        labels={labels}
      />
    </main>
  );
}
```

- [ ] **Step 2: Build** — `cd folio && npm run build`. Expected: `/[locale]/schedule` in the route list.
- [ ] **Step 3: Commit**
```bash
git add "Folio/src/app/[locale]/(app)/schedule/page.tsx"
git commit -m "feat(folio): add schedule page (server)"
```

---

### Task 10: Verification

- [ ] **Step 1: Full check** — `cd folio && npx tsc --noEmit && npm test && npm run build`. All pass; `/[locale]/schedule` registered.
- [ ] **Step 2: RLS (SQL)** — confirm policies:
```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('folio_lessons','folio_lesson_students');
```
Expected: a `workspace_isolation` policy (ALL) on each.
- [ ] **Step 3: Smoke** — `npm run dev`, log in, open `/ru/schedule`: navigate weeks; click a slot → create a solo lesson with one student → it appears as a block at the right time; click it → reschedule (change time) → moves; mark "Состоялось" → block shows completed style; create a group lesson with 2 students → shows "Группа (2)"; cancel → struck through. Verify rows in `folio_lessons` / `folio_lesson_students`.
- [ ] **Step 4:** Note results; fix any failure before docs.

---

### Task 11: Documentation (DoD)

**Files:** Modify `Folio/docs/DATA_MODEL.md`, `Folio/docs/ARCHITECTURE.md`, `Folio/docs/ROADMAP.md`.

- [ ] **Step 1: `DATA_MODEL.md`** — add `### folio_lessons ✅` + `### folio_lesson_students ✅` (columns from Task 1; note enums, indexes, and the parent-scoped RLS on the join table); add the migration to "Применённые миграции"; mark the old prefix-less `lessons`/`lesson_students` drafts superseded.
- [ ] **Step 2: `ARCHITECTURE.md`** — add a "Schedule module (M4)" section: `lib/lessons/` (schema/week/queries/actions), custom week grid (`ScheduleBoard`), `LessonDialog`, type derived from roster, browser-local time, completion sets status only (M5/M6 hooks later).
- [ ] **Step 3: `ROADMAP.md`** — check off M4 items; note deferred: drag-and-drop, month/day views, overlap layout, per-user timezone, completion→billing/journal triggers, roster edit after creation.
- [ ] **Step 4: Commit + push**
```bash
git add Folio/docs/DATA_MODEL.md Folio/docs/ARCHITECTURE.md Folio/docs/ROADMAP.md
git commit -m "docs(folio): document M4 Schedule (DATA_MODEL, ARCHITECTURE, ROADMAP)"
git push
```

---

## Self-Review

**Spec coverage:**
- `folio_lessons` + `folio_lesson_students` + RLS (incl. join-table parent scoping) → Task 1. ✓
- Weekly custom grid + week nav → Task 8. ✓
- Create (solo/group), type derived → Tasks 2, 5, 7. ✓
- Reschedule via dialog, cancel, complete → Tasks 5, 7. ✓
- online/offline, duration, notes → Tasks 5, 7. ✓
- Student picker (active) → Tasks 4, 7. ✓
- Status styling (completed/cancelled) → Task 8. ✓
- workspace_id server-derived → Task 5 (`callerWorkspaceId`). ✓
- Browser-local time → Tasks 3 (helpers), 7/8 (usage). ✓
- i18n ru/en + nav → Task 6. ✓
- Tests (schema, type, week) + RLS check → Tasks 2, 3, 10. ✓
- Docs → Task 11. ✓
- Deferred (drag, month view, per-user tz, triggers, roster edit) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` (Task 1) is an explicit timestamp substitution with instructions. No vague TODOs.

**Type consistency:** `LessonInput`/`lessonTypeFor` (Task 2) used in actions (5) and dialog (7); `LessonWithStudents`/`StudentOption` (Task 4) used in queries→board(8)→dialog(7) and page(9); `ActionResult` returned by all actions; `LessonDialogState` defined in Task 7 and consumed in Task 8; `week.ts` helpers (`toDatetimeLocal`/`fromDatetimeLocal`/`mondayFromParam`/`weekRange`/`toDateParam`) defined in Task 3 and used in 7/8/9. shadcn imports match installed exports (Dialog*, Button, Input, Label). `localDayIndex` and grid constants are self-contained in Task 8.

## Notes for execution
- Migration applied to the live shared project (additive); rename local file to recorded version if applied via MCP.
- The dialog seeds form state on open via a render-time `seededFor` guard (avoids the `useState`-initializer-not-rerunning issue seen in M3); keep that pattern.
- `Button` `variant`/`size` and Base UI `Dialog` (`render` vs `asChild`) — match the installed API; no `any`.
- Overlapping concurrent lessons render as full-width blocks and may visually overlap — acceptable for M4 (noted in spec).
