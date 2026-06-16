# Folio — Architecture

> Последнее обновление: 2026-06-08
> Статус: M1 (Фундамент) — структура проекта инициализирована

---

## Принцип: расширение english-bot, не отдельный продукт

Folio — это не отдельный проект. Один репозиторий (`english_bot`), один Supabase-проект
(`btlglelwxazdxfqdmcti`), общие ресурсы. Next.js-приложение лежит в `folio/` рядом с
`supabase/functions/english-bot/`. Изоляция данных — через префикс таблиц `folio_*`
(см. [[002-multitenancy]]).

---

## Стек

- **Frontend:** Next.js (App Router, TypeScript, src-dir), Tailwind CSS v4, shadcn/ui
- **i18n:** next-intl, локали `ru` (дефолт) / `en`, маршрутизация через сегмент `[locale]`
- **Backend:** Supabase (Postgres + RLS + Auth + Edge Functions + Storage)
- **Bot Bridge:** english-bot (Deno Edge Function) — отдельный рантайм, общается с Folio
  только через таблицы `homework_templates` / `template_prompts`

---

## Структура `folio/`

```
folio/
├── src/
│   ├── app/[locale]/      — страницы (App Router, локализованные роуты)
│   ├── components/        — переиспользуемые UI-компоненты (включая shadcn/ui)
│   ├── i18n/              — routing.ts, navigation.ts, request.ts (next-intl)
│   ├── lib/               — бизнес-логика, Supabase-клиент, серверные хелперы
│   └── proxy.ts           — middleware для роутинга локалей (Next.js 16 convention)
├── messages/              — ru.json, en.json
└── docs/                  — CLAUDE.md, AGENTS.md
```

Бизнес-логика не размещается в компонентах — только в `lib/` или Edge Functions
(см. правило в `CLAUDE.md`).

---

## i18n

- Маршруты локализованы через App Router сегмент `[locale]`: `/ru/...`, `/en/...`
- `routing.ts` задаёт список локалей и дефолт (`ru`)
- `proxy.ts` (Next.js 16, бывший `middleware.ts`) редиректит `/` → `/ru` и резолвит локаль
  из cookie/Accept-Language
- Тексты — в `messages/{locale}.json`, ключи добавляются сразу на оба языка

---

## Многотенантность

Каждая таблица Folio содержит `workspace_id` и защищена RLS-политикой
`workspace_isolation`, использующей `security definer` функцию
`folio_current_workspace_id()` (обходит RLS на `folio_users`, чтобы избежать рекурсии).
Подробности и шаблон — в [[DATA_MODEL]] и [[002-multitenancy]].

---

## Bot Bridge

english-bot остаётся самостоятельной Deno Edge Function. Folio не модифицирует его
код напрямую — взаимодействие идёт через общие таблицы БД (`homework_templates`,
`template_prompts`), которые читает/пишет бот. Контракт между ними фиксируется
отдельно при разработке соответствующего модуля (M5+).

Исключение для M2a: бот участвует в auth-флоу, подтверждая токены входа в
таблице `folio_login_tokens` (см. ниже).

---

## Telegram-login (M2a)

Вход в Folio — через bot deep-link + одноразовый токен, переиспользуя english-bot
(а не Telegram Login Widget, который требует публичный HTTPS-домен на боте). Это
работает на localhost без туннелей и доменов. Решение зафиксировано в
[[003-telegram-auth]], таблица токенов — в [[DATA_MODEL]] (`folio_login_tokens`).

Флоу:

1. Страница `/[locale]/login` минтит токен: `POST /api/auth/telegram/start` → запись
   `pending` в `folio_login_tokens`.
2. Открывается `https://t.me/garro_oracle_bot?start=folio_login_<token>`; страница
   опрашивает `GET /api/auth/telegram/status`.
3. english-bot ловит `/start folio_login_<token>`, резолвит folio-юзера по `telegram_id`
   (через `folio_auth_methods`) и помечает токен `confirmed`.
4. На `confirmed` страница вызывает `POST /api/auth/telegram/session` → роут
   потребляет токен (`consumed`) и выпускает сессию Supabase.

**Минтинг сессии** (на сервере Folio): `supabase.auth.admin.generateLink({type:'magiclink', email})`
→ `verifyOtp({token_hash, type:'email'})`. Magic link и email-OTP делят реализацию,
поэтому verify-тип — `'email'`. Auth-куки пишет `@supabase/ssr`.

**Защита роутов**: `proxy.ts` (middleware в Next 16) делает только ОПТИМИСТИЧНУЮ
проверку наличия cookie `sb-*-auth-token` и редиректит неавторизованных на
`/[locale]/login`. Реальная верификация — в server-компоненте дашборда через
`supabase.auth.getUser()` (per Next 16 docs).

**Bootstrap**: первый super_admin захардкожен seed-миграцией (telegram_id 744230399) —
ВРЕМЕННОЕ решение, заменить нормальным онбордингом. Отложено в M2a: email/magic-link
как пользовательский метод, инвайты, n8n, Login Widget.

---

## Students module (M3)

Workspace-scoped CRUD ростера учеников репетитора: список, создание, редактирование,
мягкая архивация/восстановление. **С 2026-06-16 экран учеников слит с расписанием** —
ученики живут правой колонкой на `/[locale]/schedule`; `/[locale]/students` редиректит туда.

- **Серверный слой** `lib/students/`:
  - `schema.ts` — zod `studentInputSchema` (name обязателен; email/telegramId/defaultRate/notes опциональны).
  - `queries.ts` — `listStudents(includeArchived)`.
  - `actions.ts` — `createStudent` / `updateStudent` / `archiveStudent` / `restoreStudent`
    (`"use server"`). `workspace_id` берётся из строки `folio_users` сессионного юзера,
    **никогда** из клиента; запись идёт через request-scoped серверный клиент, чтобы
    применялась RLS.
- **UI**: `StudentsPanel.tsx` (client, в `(app)/schedule/`) — вертикальный список учеников
  правой колонкой расписания: «+ Добавить», edit/архив, клиентский тумблер «показать архив».
  `students/page.tsx` теперь редиректит на `/schedule`. `StudentForm.tsx` (client, shadcn Dialog,
  create/edit, sonner toasts) переиспользуется панелью; форма сидируется один раз на открытие
  (ключ `mode:id`), поэтому `router.refresh()` соседних действий не затирает несохранённые правки.
  `StudentsTable.tsx` удалён. `<Toaster/>` смонтирован в `[locale]/layout.tsx`.
- **Архивация** — мягкая (`archived_at`, восстановимо). PII-скраб и логин/инвайты ученика
  отложены.

Таблица и RLS — в [[DATA_MODEL]] (`folio_students`).

---

## Schedule module (M4)

Недельный календарь занятий. Роут `/[locale]/schedule` (`(app)/schedule/`).

- **Сетка** — собственная CSS-вёрстка без библиотеки: 7 колонок-дней (Пн–Вс) × строки-часы
  07:00–22:00. Клик по пустому слоту — создание занятия, клик по занятию — карточка
  редактирования/действий. Время — браузерно-локальное (per-user TZ отложен).
- **Серверный слой** `lib/lessons/`:
  - `schema.ts` — zod `lessonInputSchema` + `lessonTypeFor` (вывод типа из ростера).
  - `week.ts` — `startOfWeek` / `weekRange` / `toDatetimeLocal` / `fromDatetimeLocal` /
    `mondayFromParam` / `toDateParam` (навигация по неделям, конверсия `datetime-local`).
  - `queries.ts` — `listLessonsInRange`, `listActiveStudents`.
  - `actions.ts` (`"use server"`) — `createLesson` (вставляет урок + ростер, откатывает
    урок если вставка ростера упала), `updateLesson`, `cancelLesson`, `completeLesson`.
    `workspace_id` берётся из сессии, **никогда** из клиента.
- **UI**: двухпанельный экран — `ScheduleBoard.tsx` (client, сетка-неделя) по центру +
  `StudentsPanel.tsx` (ученики) правой колонкой (`xl:flex-row`, ниже `xl` — стопкой);
  `LessonDialog.tsx` (create / edit / cancel / complete). Сетка компактная по высоте
  (`HOUR_PX=48`, `MIN_CARD_PX=30`), карточки занятий — одной строкой «ЧЧ:ММ · Имя» + ✓.
  `page.tsx` грузит `listStudents(true)` один раз: активных отдаёт доске, всех — панели.
  В сайдбаре «Расписание»; пункт «Ученики» убран (слит в расписание).
- **Тип занятия выводится** из размера ростера (1 ученик → solo, 2+ → group).
- Отметка «состоялось» только ставит `status='completed'` — триггеры биллинга (M5) /
  журнала (M6) добавятся позже.
- **RLS**: `folio_lessons` workspace-scoped; `folio_lesson_students` — parent-scoped
  через `folio_lessons`.

Таблицы и RLS — в [[DATA_MODEL]] (`folio_lessons`, `folio_lesson_students`).

---

## Homework generation (M7a)

Генерация домашних заданий теперь доступна и в веб-Folio, и в боте — на **одном
движке**, без дрейфа промптов. Решение о равносилии веб ↔ бот зафиксировано в
[[project-web-bot-parity]].

- **Общий движок** `supabase/functions/_shared/generate.ts` — промпты +
  `generateModuleContent` / `generateTeacherGuide` / `applyEdit` (Deno + Anthropic).
  Раньше этот код жил в `lib/claude.ts` бота; теперь `lib/claude.ts` — тонкий
  ре-экспорт из `_shared`. Бот импортирует движок напрямую.
- **HTTP-обёртка** `supabase/functions/folio-generate/index.ts` — Edge Function,
  выставляет тот же движок по HTTP для веба. Закрыта секретом (заголовок
  `x-folio-secret` сверяется с `FOLIO_GENERATE_SECRET`), деплоится
  `--no-verify-jwt`, переиспользует `ANTHROPIC_KEY`. Оба потребителя (бот через
  импорт, веб через `folio-generate`) гоняют идентичный движок.
- **Веб-слой** `lib/homework/`:
  - `schema.ts` — zod `homeworkInputSchema` + `MODULE_TYPES` (`verb` обязателен
    для `VERB_SENTENCES`).
  - `generate.ts` — `callGenerate`: `fetch` к `folio-generate` с секретом.
  - `queries.ts` — `listTemplates`.
  - `actions.ts` (`"use server"`) — `generateHomework` (превью, auth-gated) и
    `saveTemplate` (workspace + автор берутся из сессии, **никогда** из клиента).
- **UI** (`(app)/homework/`): `page.tsx` + `HomeworkGenerator.tsx` — форма
  (тип задания / тема / уровень / аудитория / [глагол]) → генерация → превью →
  «Сохранить шаблон»; плюс список шаблонов. В сайдбар добавлен пункт «Домашки».
- **Хранилище** — `folio_homework_templates` (workspace RLS, `source` ∈ web/bot).

### Назначение домашек (M7b)
- **Хранилище** — `folio_homework_assignments` (template → student, `due_date`, `status` assigned/submitted/reviewed). RLS `workspace_isolation` с cross-entity `WITH CHECK` (template и student обязаны быть из того же workspace).
- **Слой** — `lib/homework/queries.ts` `listAssignments` (джойн student + template), `lib/homework/assignments.ts` (`"use server"`): `assignTemplate` (workspace+assigned_by с сессии, upsert с `ignoreDuplicates` — повторное назначение no-op), `updateAssignmentStatus`. zod в `assignments-schema.ts`.
- **UI** — `TemplatesList.tsx` (просмотр/копирование контента шаблона для ручной отправки + диалог «Назначить» с мульти-выбором учеников и дедлайном) и `AssignmentsList.tsx` (смена статуса).
- **Доставка** — пока ручная (репетитор копирует контент). Авто-доставка (Telegram/email) — M7c: бот не может инициировать сообщение ученику, не нажавшему Start; почты/n8n нет.

Отложено: авто-доставка (M7c); teacher-guide / правки / PDF в вебе; Template Editor (промпты в БД); кэширование генерации; стриминг; кабинет ученика (M8).

Таблицы и RLS — в [[DATA_MODEL]] (`folio_homework_templates`, `folio_homework_assignments`).

## Billing (M5)

Учёт денег. Роут `/[locale]/billing` (`(app)/billing/`).

- **Леджер** `folio_student_payments` (charge/payment). Остаток = Σcharge − Σpayment.
- **Автоначисление как инвариант:** charge существует ⇔ занятие `completed`. Зашито в действия статуса занятия (`lib/lessons/actions.ts`): `completeLesson` → `chargeForCompletedLesson` (создаёт charge по ростеру, сумма = `rate_override ?? default_rate`); `reopenLesson`/`cancelLesson` → `reverseChargesForLesson`. Best-effort: если начисление упало, статус всё равно сменился (статус — источник правды, ошибка логируется). Идемпотентно через `unique(lesson_id, student_id)`.
- **Слой** `lib/billing/`: `amount.ts` (чистая `chargeAmount`), `charges.ts` (create/reverse), `queries.ts` (`listBalances` — JS-агрегация леджера, `listLedgerEntries`), `actions.ts` (`recordPayment`, `deleteEntry`), `schema.ts` (zod оплаты).
- **UI** — `BalancesList.tsx`: баланс по ученикам (начислено/оплачено/остаток, долги подсвечены), диалог «Записать оплату», раскрытие леджера с удалением операции (коррекция).

Отложено: UI переопределения ставки в занятии (`rate_override` есть), фильтры по периоду, редактирование суммы charge, валюта. Таблица и RLS — в [[DATA_MODEL]] (`folio_student_payments`).

---

## Lesson Journal (M6)

Запись о том, что прошло на занятии. Живёт на экране расписания (`(app)/schedule/`), отдельного роута нет.

- **Триггер:** отметка ✓ «состоялось» остаётся быстрым тапом и форму **не** открывает. На состоявшемся занятии в `LessonDialog` появляется кнопка «Журнал занятия» → открывает `JournalDialog` (открытие закрывает LessonDialog — без вложенных диалогов).
- **Гранулярность:** одна запись на занятие (`folio_lesson_journal`, `unique(lesson_id)`, upsert). История по ученику собирается через ростер (`journal → lesson → lesson_students`), отдельного `student_id` в записи нет.
- **Слой** `lib/journal/`: `schema.ts` (zod `journalInputSchema` — поля `topic/level/comment/progress` опциональны, `level` — enum CEFR, отклоняет полностью пустую запись), `queries.ts` (`getJournalForLesson`, `listJournalForStudent` через PostgREST-embed `folio_lessons!inner(folio_lesson_students!inner)` с фильтром по `student_id`), `actions.ts` (`"use server"`: `saveJournalEntry` upsert по `lesson_id`, `workspace_id`+`created_by` из сессии; `loadJournalEntry`/`loadJournalForStudent` — обёртки для ленивой загрузки клиентскими диалогами).
- **UI** (`(app)/schedule/`): `JournalDialog.tsx` (запись/правка одной записи; форма грузится по открытию через server action в `useEffect` с cancelled-флагом), `StudentJournalDialog.tsx` (история ученика; открывается кликом по имени в `StudentsPanel`). Серверный `page.tsx` собирает plain-объекты лейблов (namespace `Journal`) и передаёт вниз — функции через границу RSC не передаются.

Отложено: шкала/статистика прогресса (выбран свободный текст), per-student записи для групп, связь с домашками. Таблица и RLS — в [[DATA_MODEL]] (`folio_lesson_journal`).
