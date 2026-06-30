# Folio Bento Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить пустую страницу `/[locale]/dashboard` в бенто-командный центр репетитора (single-tutor): занятия сегодня + генерация задания с вычиткой + раскрытые блоки домашки/долги + быстрые действия и переключатель темы в шапке.

**Architecture:** Серверная страница грузит данные через существующие queries (`Promise.all`), чистые derive-функции считают «сегодня/долги/просрочка», тонкие клиентские плитки рендерят. Генерация/вычитка идут через единую точку (`lib/homework/`) → Edge Function `folio-generate` (добавляем `edit`-действие поверх уже существующего движка `applyEdit`). Темы — `next-themes` поверх готовых токенов `globals.css`.

**Tech Stack:** Next.js 16 (App Router, RSC, src-dir), React 19, next-intl, next-themes, shadcn/ui, Tailwind v4, Supabase (RLS), Deno Edge Function. Тесты — vitest.

## Global Constraints

- Бизнес-логика только в `src/lib/<module>/`, не в компонентах (правило проекта).
- `workspace_id` берётся из сессии в server-actions/queries, НИКОГДА из клиента; запись — request-scoped клиентом (RLS).
- Любой новый текст = ключ сразу в `messages/ru.json` И `messages/en.json` (i18n parity-тест должен проходить).
- Через границу RSC → client передаём только сериализуемое (объекты `labels`, не функции).
- TypeScript strict; `any` запрещён без комментария-обоснования. `npx tsc --noEmit` зелёный перед PR.
- Файлы ≤ ~250 строк; одна ответственность на файл.
- Тема через CSS-токены (`var(--primary)`, `var(--card)`, `--brand-coral`, `--sidebar*`), без хардкода цветов — обе темы получаются автоматически.
- Edge Function `folio-generate` закрыта секретом `FOLIO_GENERATE_SECRET` (header `x-folio-secret`); деплой `--no-verify-jwt`.

---

## Preflight (до Task 1)

- [ ] **P0:** Влить PR #2 (доки) и перебазировать ветку, чтобы правки `ARCHITECTURE.md` не конфликтовали:
  `gh pr merge 2 --squash` (делает владелец / с разрешения) → затем `git fetch origin && git rebase origin/main`. Если PR #2 не вливается — продолжать на текущей ветке, секцию в `ARCHITECTURE.md` добавлять в конец (минимизировать конфликт).

---

## Task 1: Derive-функции дашборда (чистая логика, TDD)

Чистые функции для «занятия сегодня / должники / бакеты домашек». Изолированы и тестируемы — фундамент страницы.

**Files:**
- Create: `Folio/src/lib/dashboard/derive.ts`
- Test: `Folio/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- Consumes: типы `LessonWithStudents` (`lib/lessons/queries.ts`), `Balance` (`lib/billing/queries.ts`), `AssignmentRow` (`lib/homework/queries.ts`).
- Produces:
  - `todayLessons(lessons: LessonWithStudents[], nowISO: string): LessonWithStudents[]` — занятия, у которых `scheduled_at` приходится на ту же дату (Europe/Moscow), что и `nowISO`, статус ≠ `cancelled`, сортировка по времени.
  - `debtors(balances: Balance[]): { rows: Balance[]; total: number }` — `balance > 0`, по убыванию `balance`; `total` = сумма.
  - `homeworkBuckets(assignments: AssignmentRow[], todayISODate: string): { review: AssignmentRow[]; overdue: AssignmentRow[]; reviewCount: number; overdueCount: number }` — `review` = `status === "submitted"`; `overdue` = `status === "assigned" && due_date != null && due_date < todayISODate`.
  - `mskDateString(iso: string): string` — `YYYY-MM-DD` в зоне Europe/Moscow (через `Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow"})`).

- [ ] **Step 1: Написать падающие тесты** — `Folio/src/lib/dashboard/derive.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { todayLessons, debtors, homeworkBuckets, mskDateString } from "./derive";

const lesson = (id: string, scheduled_at: string, status = "scheduled") => ({
  id, type: "solo" as const, scheduled_at, duration_min: 60,
  status: status as "scheduled" | "completed" | "cancelled",
  location_type: "online" as const, notes: null, students: [{ id: "s1", name: "Аня" }],
});

describe("mskDateString", () => {
  it("конвертирует UTC в дату по Москве (+3)", () => {
    expect(mskDateString("2026-06-30T21:30:00Z")).toBe("2026-07-01"); // 00:30 МСК
  });
});

describe("todayLessons", () => {
  it("оставляет только занятия сегодня по МСК, без отменённых, по времени", () => {
    const now = "2026-06-30T08:00:00Z";
    const out = todayLessons([
      lesson("a", "2026-06-30T15:00:00Z"),
      lesson("b", "2026-06-30T07:00:00Z"),
      lesson("c", "2026-07-01T07:00:00Z"),          // завтра
      lesson("d", "2026-06-30T10:00:00Z", "cancelled"),
    ], now);
    expect(out.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("debtors", () => {
  it("только положительный баланс, по убыванию, с суммой", () => {
    const r = debtors([
      { student_id: "1", name: "A", charged: 100, paid: 100, balance: 0 },
      { student_id: "2", name: "B", charged: 300, paid: 100, balance: 200 },
      { student_id: "3", name: "C", charged: 150, paid: 100, balance: 50 },
    ]);
    expect(r.rows.map((x) => x.student_id)).toEqual(["2", "3"]);
    expect(r.total).toBe(250);
  });
});

describe("homeworkBuckets", () => {
  it("submitted → review; assigned с прошедшим due_date → overdue", () => {
    const row = (id: string, status: string, due_date: string | null) =>
      ({ id, status, due_date, student_name: "A", template_topic: "T", template_type: "READING_MODULE" });
    const r = homeworkBuckets([
      row("a", "submitted", null),
      row("b", "assigned", "2026-06-28"),
      row("c", "assigned", "2026-07-05"),
      row("d", "reviewed", "2026-06-01"),
    ], "2026-06-30");
    expect(r.review.map((x) => x.id)).toEqual(["a"]);
    expect(r.overdue.map((x) => x.id)).toEqual(["b"]);
    expect(r.reviewCount).toBe(1);
    expect(r.overdueCount).toBe(1);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает.** `cd Folio && npx vitest run src/lib/dashboard/derive.test.ts` → FAIL (module not found).

- [ ] **Step 3: Реализовать** `Folio/src/lib/dashboard/derive.ts`:

```typescript
import type { LessonWithStudents } from "@/lib/lessons/queries";
import type { Balance } from "@/lib/billing/queries";
import type { AssignmentRow } from "@/lib/homework/queries";

export function mskDateString(iso: string): string {
  // en-CA даёт YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(iso));
}

export function todayLessons(lessons: LessonWithStudents[], nowISO: string): LessonWithStudents[] {
  const today = mskDateString(nowISO);
  return lessons
    .filter((l) => l.status !== "cancelled" && mskDateString(l.scheduled_at) === today)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export function debtors(balances: Balance[]): { rows: Balance[]; total: number } {
  const rows = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = rows.reduce((s, b) => s + b.balance, 0);
  return { rows, total };
}

export function homeworkBuckets(
  assignments: AssignmentRow[],
  todayISODate: string,
): { review: AssignmentRow[]; overdue: AssignmentRow[]; reviewCount: number; overdueCount: number } {
  const review = assignments.filter((a) => a.status === "submitted");
  const overdue = assignments.filter(
    (a) => a.status === "assigned" && a.due_date != null && a.due_date < todayISODate,
  );
  return { review, overdue, reviewCount: review.length, overdueCount: overdue.length };
}
```

> Если типы `LessonWithStudents`/`Balance`/`AssignmentRow` не экспортируются — добавить `export` к интерфейсу в соответствующем `queries.ts` (отдельный микро-коммит, не меняя логику).

- [ ] **Step 4: Запустить — зелёный.** `cd Folio && npx vitest run src/lib/dashboard/derive.test.ts` → PASS.

- [ ] **Step 5: Коммит.** `git add Folio/src/lib/dashboard/ && git commit -m "feat(folio): derive-функции дашборда (today/debtors/homework buckets) + тесты"`

---

## Task 2: Edge `edit`-действие + веб-обёртка (вычитка)

Расширяем `folio-generate` действием правки (движок `applyEdit` уже есть), добавляем веб-обёртку и server-action.

**Files:**
- Modify: `supabase/functions/folio-generate/index.ts`
- Modify: `Folio/src/lib/homework/generate.ts` (add `callEdit`)
- Modify: `Folio/src/lib/homework/actions.ts` (add `editHomework`)

**Interfaces:**
- Consumes: `applyEdit(original: string, editRequest: string): Promise<string>` (`_shared/generate.ts`), `generateModuleContent` (без изменений).
- Produces:
  - Edge: POST с телом `{ action: "edit", content: string, edit: string }` → `{ content }`; тело без `action` или `action: "generate"` — как раньше (генерация).
  - `callEdit(content: string, edit: string): Promise<string>` в `generate.ts`.
  - `editHomework(content: string, edit: string): Promise<{ ok: true; content: string } | { ok: false; error: string }>` (`"use server"`).

- [ ] **Step 1: Расширить Edge.** В `supabase/functions/folio-generate/index.ts` после проверки секрета и `const body = await req.json()` развилка:

```typescript
import { generateModuleContent, applyEdit } from "../_shared/generate.ts";
// ...
const body = await req.json();
if (body.action === "edit") {
  const { content, edit } = body;
  if (typeof content !== "string" || !content.trim() || content.length > 20000 ||
      typeof edit !== "string" || !edit.trim() || edit.length > 1000) {
    return json({ error: "bad request" }, 400);
  }
  const edited = await applyEdit(content, edit);
  return json({ content: edited });
}
// ниже — существующая ветка генерации (moduleType/level/...)
```

- [ ] **Step 2: Type-check бота/движка.** `deno check supabase/functions/folio-generate/index.ts supabase/functions/_shared/generate.ts` → без ошибок.

- [ ] **Step 3: Веб-обёртка `callEdit`** в `Folio/src/lib/homework/generate.ts` (рядом с `callGenerate`, тот же паттерн fetch + `x-folio-secret` из env `FOLIO_GENERATE_SECRET`, URL `FOLIO_GENERATE_URL`):

```typescript
export async function callEdit(content: string, edit: string): Promise<string> {
  const res = await fetch(process.env.FOLIO_GENERATE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
    body: JSON.stringify({ action: "edit", content, edit }),
  });
  if (!res.ok) throw new Error(`folio-generate edit failed: ${res.status}`);
  const data = (await res.json()) as { content?: string };
  if (!data.content) throw new Error("empty edit result");
  return data.content;
}
```
(Сверить точные имена env/URL с существующим `callGenerate` и повторить их 1:1.)

- [ ] **Step 4: Server-action `editHomework`** в `Folio/src/lib/homework/actions.ts` (паттерн `generateHomework`: `"use server"`, auth-проверка через `createClient().auth.getUser()`):

```typescript
export async function editHomework(content: string, edit: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "unauthorized" };
  try {
    const edited = await callEdit(content, edit);
    return { ok: true as const, content: edited };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "edit failed" };
  }
}
```

- [ ] **Step 5: Type-check веба.** `cd Folio && npx tsc --noEmit` → без ошибок.

- [ ] **Step 6: Коммит.** `git add supabase/functions/folio-generate/index.ts Folio/src/lib/homework/ && git commit -m "feat: edit-действие в folio-generate + editHomework (вычитка в вебе)"`

> Деплой Edge — на этапе финальной верификации (Task 8). До деплоя вычитка в проде не работает; локально/после деплоя — да.

---

## Task 3: Тема — ThemeProvider + переключатель

Смонтировать `next-themes` (сейчас не смонтирован) и добавить переключатель. Обе темы уже в `globals.css`.

**Files:**
- Create: `Folio/src/components/theme-provider.tsx`
- Create: `Folio/src/components/ThemeToggle.tsx`
- Modify: `Folio/src/app/[locale]/layout.tsx`

**Interfaces:**
- Produces: `<ThemeProvider>` (клиентская обёртка `next-themes`), `<ThemeToggle labels={{system,light,dark}} />`.

- [ ] **Step 1: ThemeProvider** `Folio/src/components/theme-provider.tsx`:

```tsx
"use client";
import { ThemeProvider as NextThemes } from "next-themes";
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
```

- [ ] **Step 2: Смонтировать в layout** — `Folio/src/app/[locale]/layout.tsx`: добавить `suppressHydrationWarning` на `<html>` и обернуть содержимое body в `<ThemeProvider>` ВНУТРИ `NextIntlClientProvider` (или снаружи — не важно, но Toaster должен быть внутри ThemeProvider, т.к. sonner читает `useTheme`):

```tsx
<html lang={locale} suppressHydrationWarning className={`${oswald.variable} ${roboto.variable} ${geistMono.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col">
    <ThemeProvider>
      <NextIntlClientProvider>
        {children}
        <Toaster />
      </NextIntlClientProvider>
    </ThemeProvider>
  </body>
</html>
```

- [ ] **Step 3: ThemeToggle** `Folio/src/components/ThemeToggle.tsx` — кнопка, циклит system→light→dark (или dropdown), `useTheme()` из next-themes, `aria-label`, иконки lucide (`Sun`/`Moon`/`Laptop` — `lucide-react` есть). Рендерить только после `mounted` (избежать hydration-mismatch):

```tsx
"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";
export function ThemeToggle({ labels }: { labels: { system: string; light: string; dark: string } }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block h-9 w-9" aria-hidden />;
  const order = ["system", "light", "dark"] as const;
  const next = order[(order.indexOf((theme as typeof order[number]) ?? "system") + 1) % 3];
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label={labels[theme as keyof typeof labels] ?? labels.system}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-secondary">
      <Icon className="h-4 w-4" />
    </button>
  );
}
```

- [ ] **Step 4: Build-проверка.** `cd Folio && npx tsc --noEmit` → ок. (Полный smoke — Task 8.)

- [ ] **Step 5: Коммит.** `git add Folio/src/components/theme-provider.tsx Folio/src/components/ThemeToggle.tsx Folio/src/app/[locale]/layout.tsx && git commit -m "feat(folio): next-themes ThemeProvider + переключатель темы (светлая/тёмная/системная)"`

---

## Task 4: Переиспользуемый диалог оплаты

Сейчас диалог оплаты вшит в `BalancesList`. Выносим `QuickPaymentDialog`, чтобы открывать «+ Оплата» с дашборда (и переиспользовать в billing).

**Files:**
- Create: `Folio/src/app/[locale]/(app)/billing/QuickPaymentDialog.tsx`
- (Опц.) Modify: `BalancesList.tsx` — переиспользовать новый диалог (если просто; иначе не трогать).

**Interfaces:**
- Produces: `<QuickPaymentDialog open, onOpenChange, students: {id,name}[], labels />` — выбор ученика + сумма + заметка → `recordPayment({ studentId, amount, note })`; toast (`sonner`) + закрытие при `ok`.

- [ ] **Step 1:** Реализовать `QuickPaymentDialog.tsx` (`"use client"`): shadcn `Dialog`, `Select` ученика, поля amount/note, вызов `recordPayment` (`@/lib/billing/actions`), `toast.success/ error`. Следовать паттерну существующего диалога в `BalancesList.tsx` (форма, sonner).
- [ ] **Step 2:** `cd Folio && npx tsc --noEmit` → ок.
- [ ] **Step 3: Коммит.** `git add Folio/src/app/[locale]/\(app\)/billing/QuickPaymentDialog.tsx && git commit -m "feat(folio): переиспользуемый QuickPaymentDialog для быстрой оплаты"`

---

## Task 5: i18n-ключи дашборда

Все тексты дашборда — в оба файла переводов (parity).

**Files:**
- Modify: `Folio/messages/ru.json`, `Folio/messages/en.json`

- [ ] **Step 1:** Расширить namespace `Dashboard` ключами (RU + EN, одинаковый набор): `todayLessons, openSchedule, now, tomorrow, generateTitle, generateLead, askPlaceholder, create, draft, onReview, fix, fixPlaceholder, saveTemplate, saved, pdf, regenerate, assign, assigned, homework, onCheck, overdue, debts, toReceive, students, history, quickAdd, addLesson, addPayment, manageStudents, theme, themeSystem, themeLight, themeDark, empty`. Значения — осмысленные RU/EN.
- [ ] **Step 2: Проверить parity.** `cd Folio && npx vitest run` (i18n parity-тест) → PASS. Если parity-теста нет — вручную сверить, что наборы ключей идентичны.
- [ ] **Step 3: Коммит.** `git add Folio/messages/ && git commit -m "feat(folio): i18n-ключи дашборда (ru+en)"`

---

## Task 6: Клиентские плитки дашборда

Тонкие презентационные компоненты (данные приходят пропсами; логика — в Task 1 / actions).

**Files (Create, все в `Folio/src/app/[locale]/(app)/dashboard/`):**
- `DashboardBento.tsx` — сетка-обёртка (responsive: `grid` 3 колонки ≥xl, стопкой ниже; gap), принимает все данные+labels, раскладывает колонки.
- `TodayLessons.tsx` — карточка; шапка-кнопка → `Link href="/schedule"` (из `@/i18n/navigation`); список занятий (время МСК, имя/«группа N», уровень из notes? — показываем `students[0].name` или «Группа (N)», `now`-метка для текущего слота).
- `GeneratePanel.tsx` — `"use client"`: инпут темы + чипы типа/уровня → `generateHomework` → показывает черновик; поле «что поправить» → `editHomework` (обновляет черновик); кнопки `saveTemplate`/PDF(заглушка/позже)/Заново/Назначить. `useState` для draft/loading; `toast`.
- `MiniBlock.tsx` — раскрываемый блок (по умолчанию `open`), props `{ title, big, sub, tone: "amber"|"coral", children }`; используется для Домашек и Долгов.
- `HeaderActions.tsx` — `"use client"`: кнопки `История` (Link `/homework`), `Ученики`/`+Занятие`/`+Оплата` (открывают диалоги через состояние), `<ThemeToggle/>`.

**Interfaces:**
- Consumes: derive-результаты (Task 1), `generateHomework`/`saveTemplate`/`assignTemplate`/`editHomework` (actions), `LessonDialog`/`StudentForm`/`QuickPaymentDialog` (диалоги), `StudentOption[]`.
- Все тексты — через `labels` проп (объект из server-страницы).

- [ ] **Step 1:** Создать `MiniBlock.tsx` (раскрытие как в прототипе: кнопка-шапка `aria-expanded`, `useState(open=true)`, контент скрывается классом). Токены: `--brand-coral`/amber для tone.
- [ ] **Step 2:** Создать `TodayLessons.tsx` (шапка-Link → `/schedule`, список из пропса; пустое состояние `labels.empty`).
- [ ] **Step 3:** Создать `GeneratePanel.tsx` (генерация → черновик → вычитка → действия; reuse existing actions; см. прототип `bento-v3` для структуры draft/fix/actions).
- [ ] **Step 4:** Создать `HeaderActions.tsx` (быстрые действия открывают `LessonDialog`(create)/`QuickPaymentDialog`/student-flow; `История`→Link `/homework`; `<ThemeToggle/>`).
- [ ] **Step 5:** Создать `DashboardBento.tsx` (раскладка 3 колонки; слева `TodayLessons`, центр `GeneratePanel`, справа два `MiniBlock` (Домашки/Долги) с раскрытыми списками).
- [ ] **Step 6:** `cd Folio && npx tsc --noEmit` → без ошибок.
- [ ] **Step 7: Коммит.** `git add Folio/src/app/[locale]/\(app\)/dashboard/ && git commit -m "feat(folio): клиентские плитки бенто-дашборда"`

> Структуру/классы взять из утверждённого прототипа `bento-v3` (тёмная/тёплая через токены, раскрытые правые блоки, шапка-действия). Каждый файл ≤ ~250 строк.

---

## Task 7: Серверная страница дашборда (сборка)

Заменяет заглушку: грузит данные, считает derive, рендерит бенто.

**Files:**
- Rewrite: `Folio/src/app/[locale]/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `createClient`, `getUser`, `listLessonsInRange`, `listBalances`, `listAssignments`, `listStudents`, `listActiveStudents`/маппинг, derive (Task 1), `getTranslations("Dashboard")`, `DashboardBento`.

- [ ] **Step 1:** Реализовать страницу по паттерну `billing/page.tsx`/`schedule/page.tsx`:
  - `const supabase = await createClient(); const { data:{user} } = await supabase.auth.getUser(); if(!user) redirect({href:"/login", locale:"ru"})`.
  - Диапазон «сегодня и ближайшее» для занятий: вычислить `fromISO/toISO` (например текущая неделя или сегодня±1) — переиспользовать `weekRange`/`mondayFromParam` из `lib/lessons/week.ts` ИЛИ простой диапазон суток; для дашборда достаточно недели и затем `todayLessons(...)`.
  - `const nowISO = new Date().toISOString()` (серверное «сейчас»).
  - `Promise.all([ listLessonsInRange(fromISO,toISO), listBalances(), listAssignments(), listStudents(true) ])`.
  - derive: `todayLessons(lessons, nowISO)`, `debtors(balances)`, `homeworkBuckets(assignments, mskDateString(nowISO))`; активные ученики `.filter(archived_at==null).map({id,name})` для диалогов.
  - `const t = await getTranslations("Dashboard")` → `labels` объект (все ключи Task 5, сериализуемо).
  - Render `<main class="mx-auto w-full max-w-[1600px] flex-1 p-6"> <DashboardBento ... /> </main>`.
- [ ] **Step 2:** `cd Folio && npx tsc --noEmit` → ок.
- [ ] **Step 3: Коммит.** `git add Folio/src/app/[locale]/\(app\)/dashboard/page.tsx && git commit -m "feat(folio): бенто-дашборд — серверная сборка страницы"`

---

## Task 8: Сова-иконка, доки, верификация, деплой

**Files:**
- Create: `Folio/src/app/icon.svg`
- Modify: `Folio/docs/ARCHITECTURE.md` (раздел «Dashboard module» + `edit`-действие folio-generate)
- Modify: `Folio/docs/ROADMAP.md` (отметить дашборд) — опц.

- [ ] **Step 1: Сова-иконка** `Folio/src/app/icon.svg` — плоская сова в teal (`#14919E`/токен), простая, читаемая на 16px (2 глаза-круга, ушки, клюв), на прозрачном/скруглённом фоне. Next.js App Router отдаст как фавикон автоматически (заменит дефолт create-next-app).
- [ ] **Step 2: Доки** — `Folio/docs/ARCHITECTURE.md`: добавить секцию «Dashboard» (бенто, состав плиток, источники данных, единая точка генерации как хук под #23) и отразить `edit`-действие в разделе Homework generation. (DoD — в этом же PR.)
- [ ] **Step 3: Полная проверка:**
  - `cd Folio && npx tsc --noEmit` → 0 ошибок.
  - `cd Folio && npx vitest run` → все тесты зелёные (derive + i18n parity).
  - `cd Folio && npm run build` → сборка без ошибок (Next 16/OpenNext).
  - Smoke: `SMOKE_BASE_URL=<url> node scripts/smoke-render.mjs /ru/dashboard` (после деплоя) или локальный `npm run dev` + ручная проверка обеих тем, раскрытия блоков, генерации+вычитки.
- [ ] **Step 4: Деплой** (после зелёной сборки): Edge — `supabase functions deploy folio-generate --no-verify-jwt`; веб — `cd Folio && npm run cf:deploy`. Проверить вычитку и дашборд на проде.
- [ ] **Step 5: Коммит + PR.** `git add ... && git commit -m "feat(folio): сова-иконка + доки дашборда"`; затем `gh pr create` (база `main`), описание со ссылкой на спеку и прототип.

---

## Self-Review (заполнить при исполнении)

- **Покрытие спеки:** §3 раскладка → Tasks 6–7; §4 данные → Tasks 1,7; §5 генерация+вычитка → Tasks 2,6; §6 шапка → Tasks 4,6; §8 тема → Task 3; §9 сова → Task 8; §12 доки → Task 8. §10 (дайджест/кредиты) — вне scope (ок).
- **Плейсхолдеры:** код новых/рисковых частей (derive, Edge edit, theme) — полный; UI-компоненты следуют задокументированному паттерну страниц + прототипу `bento-v3` (классы/структура оттуда).
- **Типы:** derive потребляет экспортируемые типы queries (если не экспортированы — добавить `export`, Task 1 note).
- **Риск:** PR #2 (Preflight); деплой Edge до работы вычитки в проде; TZ Moscow-only.
