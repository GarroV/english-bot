# Folio — Architecture

> Последнее обновление: 2026-06-30
> Статус: M1–M9 (core) реализованы и задеплоены (Cloudflare Workers). Статусы вех — [ROADMAP.md](ROADMAP.md).

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
│   └── middleware.ts      — Edge middleware: gate авторизации + роутинг локалей
├── messages/              — ru.json, en.json
└── docs/                  — CLAUDE.md, AGENTS.md
```

Бизнес-логика не размещается в компонентах — только в `lib/` или Edge Functions
(см. правило в `CLAUDE.md`).

---

## i18n

- Маршруты локализованы через App Router сегмент `[locale]`: `/ru/...`, `/en/...`
- `routing.ts` задаёт список локалей и дефолт (`ru`)
- `middleware.ts` (Edge runtime) редиректит `/` → `/ru` и резолвит локаль
  из cookie/Accept-Language. **Используем `middleware.ts`, а не `proxy.ts`:** в Next 16
  `proxy.ts` жёстко привязан к Node-рантайму, который Cloudflare Workers (OpenNext) не
  исполняет; `middleware.ts` остаётся на Edge — его Workers поддерживают.
- `middleware.ts` также ставит **security-заголовки** на все ответы: CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`. CSP держит
  `script-src 'unsafe-inline'` (nonce-CSP требует `proxy.ts`/Node — на Workers недоступен), жёсткие
  директивы — `frame-ancestors 'none'` (кликджекинг), `object-src 'none'`, `base-uri`, `connect-src`
  (только self + Supabase). Ужесточение `script-src` (SRI/nonce) — отдельный issue (#11 хвост), требует preview-деплоя.
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
   `pending` в `folio_login_tokens`. Роут ставит **httpOnly-cookie с nonce** и хранит его
   SHA-256 в `nonce_hash` (браузер-биндинг, #4).
2. Открывается `https://t.me/garro_oracle_bot?start=folio_login_<token>`; страница
   опрашивает `GET /api/auth/telegram/status`.
3. english-bot ловит `/start folio_login_<token>` и **НЕ подтверждает автоматически**: показывает
   явный запрос с предупреждением и кнопками «Подтвердить вход» / «Отмена» (#4 login-CSRF —
   тапнутая кем-то чужим ссылка больше не авторизует молча). Только на нажатие «Подтвердить»
   бот резолвит folio-юзера по `telegram_id` (через `folio_auth_methods`) и помечает токен `confirmed`.
4. На `confirmed` страница вызывает `POST /api/auth/telegram/session` → роут потребляет токен
   (`consumed`) **только при совпадении nonce-cookie с `nonce_hash`** (#4 session fixation) и
   выпускает сессию Supabase.

**Минтинг сессии** (на сервере Folio): `supabase.auth.admin.generateLink({type:'magiclink', email})`
→ `verifyOtp({token_hash, type:'email'})`. Magic link и email-OTP делят реализацию,
поэтому verify-тип — `'email'`. Auth-куки пишет `@supabase/ssr`.

**Защита роутов**: `middleware.ts` (Edge) делает только ОПТИМИСТИЧНУЮ
проверку наличия cookie `sb-*-auth-token` и редиректит неавторизованных на
`/[locale]/login`. Реальная верификация — в server-компоненте дашборда через
`supabase.auth.getUser()` (per Next 16 docs).

**Bootstrap**: первый super_admin захардкожен seed-миграцией (telegram_id 744230399) —
ВРЕМЕННОЕ решение. Email/magic-link, n8n, Login Widget — всё ещё отложено.

### Self-serve регистрация репетитора по инвайту (M2, 2026-06-16)

Новый репетитор (заказчик) переходит по инвайт-ссылке и регистрируется через Telegram,
получая **свой** workspace с демо-данными.

- **`folio_signup_invites`** — инвайт, создающий новый workspace при погашении (service-role only). Выдаётся скриптом/SQL (UI супер-админа — позже в M9).
- **Страница** `/[locale]/invite/[token]` (публичная, в middleware) валидирует инвайт и переиспользует `LoginPanel` (`inviteToken` + `redirectTo=/schedule`).
- **`/api/auth/telegram/start`** принимает `inviteToken` → привязывает его к login-токену. **Бот** `confirmFolioLogin`: если Telegram не привязан, но токен несёт валидный инвайт — подтверждает (пишет `telegram_id` + имя), `folio_user_id=null`; отдельный исход `invite_expired`.
- **`/api/auth/telegram/session`** на подтверждённом токене с инвайтом вызывает `registerTutorFromInvite` (`lib/auth/register.ts`): orphan-safe создание `auth.users` (admin `createUser`) → **атомарная RPC `folio_register_tutor`** (consume инвайта + workspace + user + owner + auth_method в одной транзакции) → демо-сид → выпуск сессии.
- **Безопасность:** инвайт строго one-use (consume атомарен с созданием, без отката в pending → утёкшая ссылка не плодит аккаунты для разных Telegram); `telegram_id` доверяется только из токена (его пишет бот через service-role); уже зарегистрированный Telegram логинится в существующий аккаунт без дубля; синтетический email `tg<id>@folio.local` (внутренний, для сессии). Проверено e2e на проде. Findings security-review закрыты.
- **`lib/auth/demo-seed.ts`** — сид нового workspace: 3 ученика, 2 занятия (одно «состоялось» с записью журнала + charge/payment), шаблон+назначение домашки.

Отложено: инвайты участников в существующий workspace (`folio_invite_tokens`); email-инвайты.

### Super-admin панель (M9 core, 2026-06-16)

Роут `/[locale]/admin` — только для `super_admin`. Выпуск инвайтов без разработчика + обзор воркспейсов.

- **Гейт `getSuperAdmin()`** (`lib/admin/guard.ts`): читает `folio_users.role` текущей сессии через request-scoped клиент (своя строка, RLS). Применяется **и в странице** (иначе redirect на `/dashboard`), **и в каждом server-action**.
- **`lib/admin/queries.ts`** (server-only): `listSignupInvites`, `listWorkspacesOverview` — кросс-воркспейсные чтения через service-role admin-клиент (RLS видит только свой workspace), вызываются только из гейтнутой страницы.
- **`lib/admin/actions.ts`** (`"use server"`, каждый гейтит `getSuperAdmin()`): `createSignupInvite` (ttl 1..90д, токен, `created_by`=super_admin) и `revokeSignupInvite` (удаляет только `pending`).
- **UI** `AdminPanel` (одна секция «Репетиторы»): форма инвайта → pending-инвайты «Ожидают регистрации» (использованные скрыты — они уже строки воркспейсов) → таблица воркспейсов (репетитор, ученики, занятия, статус «🚫 отключён», раскрываемая строка статистики #77: занятия за месяц по МСК, генерации из `eb_llm_usage` — bot: ref_id=telegram_id, folio: ref_id=workspace_id, — задания, последняя активность) с кнопкой «Отозвать/Восстановить доступ» (#76): server action `setTutorAccess` — зеркало bot `/revoke`/`/restore` (disabled_at в folio_users + eb_users по telegram_id; самоблокировка супер-админа запрещена). Ниже — секция «Отзывы» (#67): последние записи `folio_feedback` (копия Telegram-уведомлений владельцу). Пункт «Админка» в сайдбаре — только super_admin (layout резолвит роль).
- **Безопасность:** server-actions — публичные POST-эндпоинты, поэтому гейт в КАЖДОМ (не только в UI/навигации). Проверено e2e: репетитор на `/admin` → 307 на `/dashboard`, контент не утекает.

Отложено: ручное создание/блокировка/удаление репетиторов и воркспейсов.

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
  **Действие `edit`** (2026-07-01): тело `{ action: "edit", content, edit }` →
  `applyEdit` (вычитка/правка готового задания, движок уже это умел; веб-обёртки
  `callEdit`/`editHomework`). Используется в дашборде. Без `action` — генерация, как раньше.
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
- **Автоначисление как инвариант:** charge существует ⇔ занятие `completed` (исключение: поздняя отмена с частичным начислением — канон в [[DATA_MODEL]] `folio_student_payments`). С 2026-07-01 — **атомарно через RPC** (`folio_complete_lesson` / `folio_reopen_lesson` / `folio_cancel_lesson`, `SECURITY INVOKER`, `FOR UPDATE`): смена статуса и запись/откат charge — в одной транзакции, либо оба, либо ничего (сбой начисления откатывает статус и возвращает ошибку, а не `ok:true`). `folio_complete_lesson` пересоздаёт charges по **текущим** ставкам (`coalesce(rate_override, default_rate, 0)`) → пересчёт после смены ставки работает. `folio_create_lesson` создаёт занятие+ростер атомарно. Вызовы — из `lib/lessons/actions.ts`. Идемпотентно через `unique(lesson_id, student_id)`.
- **Слой** `lib/billing/`: `amount.ts` (чистая `chargeAmount` — канон правила ставки, зеркалимый в SQL RPC), `fifo.ts` (FIFO-аллокация платежей на начисления → статус каждой строки: paid/partial/debt), `summary.ts` (сводка за диапазон `buildRangeSummary`; `buildMonthSummary` — месячная обёртка), `period.ts` (разбор периода из URL: неделя/месяц/год/произвольный, MSK → UTC-границы + бакеты графика `buildChartBuckets`), `reminder.ts` (тексты напоминания о долге и выписки за месяц), `queries.ts` (`listBalances`, `listBillingEntries`, `listMonthLessons`), `actions.ts` (`recordPayment`, `recordCharge`, `deleteEntry`), `schema.ts` (zod оплаты/начисления). (`charges.ts` удалён — логика начисления/отката перенесена в атомарные RPC.)
- **UI** — двухколоночный экран (v2.1, 2026-07-08): слева финансы за период — `PeriodSummaryCard.tsx` (пресеты неделя/месяц/год/период `?p=…`, стрелки ←/→, `CustomRangeForm.tsx` для произвольных дат, тайлы заработано/получено/ждёт оплаты) + `EarningsChart.tsx` (линейный SVG-график «заработано vs получено» по дням/месяцам, токены `--chart-1/--chart-2`, без chart-библиотеки); справа — `StudentCards.tsx` (карточки учеников: FIFO-история занятий и начислений, долг/аванс-бейджи, диалоги «Записать оплату» / «Ручное начисление» / «Напомнить»). (`MonthSummaryCard.tsx` заменён `PeriodSummaryCard.tsx`.)
- **Поздняя отмена** — RPC `folio_cancel_lesson_with_charge` начисляет долю ставки при отмене занятия с предупреждением; обычная отмена (`folio_cancel_lesson`) такой charge не трогает (см. [[DATA_MODEL]] `20260708100000`).

Отложено: UI переопределения ставки в занятии (`rate_override` есть), редактирование суммы charge, валюта. Таблица и RLS — в [[DATA_MODEL]] (`folio_student_payments`).

---

## Lesson Journal (M6)

Запись о том, что прошло на занятии. Живёт на экране расписания (`(app)/schedule/`), отдельного роута нет.

- **Триггер:** отметка ✓ «состоялось» остаётся быстрым тапом и форму **не** открывает. На состоявшемся занятии в `LessonDialog` появляется кнопка «Журнал занятия» → открывает `JournalDialog` (открытие закрывает LessonDialog — без вложенных диалогов).
- **Гранулярность:** одна запись на занятие (`folio_lesson_journal`, `unique(lesson_id)`, upsert). История по ученику собирается через ростер (`journal → lesson → lesson_students`), отдельного `student_id` в записи нет.
- **Слой** `lib/journal/`: `schema.ts` (zod `journalInputSchema` — поля `topic/level/comment/progress` опциональны, `level` — enum CEFR, отклоняет полностью пустую запись), `queries.ts` (`getJournalForLesson`, `listJournalForStudent` через PostgREST-embed `folio_lessons!inner(folio_lesson_students!inner)` с фильтром по `student_id`), `actions.ts` (`"use server"`: `saveJournalEntry` upsert по `lesson_id`, `workspace_id`+`created_by` из сессии; `loadJournalEntry`/`loadJournalForStudent` — обёртки для ленивой загрузки клиентскими диалогами).
- **UI** (`(app)/schedule/`): `JournalDialog.tsx` (запись/правка одной записи; форма грузится по открытию через server action в `useEffect` с cancelled-флагом), `StudentJournalDialog.tsx` (история ученика; открывается кликом по имени в `StudentsPanel`). Серверный `page.tsx` собирает plain-объекты лейблов (namespace `Journal`) и передаёт вниз — функции через границу RSC не передаются.

Отложено: шкала/статистика прогресса (выбран свободный текст), per-student записи для групп, связь с домашками. Таблица и RLS — в [[DATA_MODEL]] (`folio_lesson_journal`).

---

## Dashboard (бенто, 2026-07-01)

Стартовая страница `/[locale]/dashboard` — командный центр репетитора (single-tutor) в формате бенто. Раньше была заглушка (только роль).

- **Раскладка** (3 колонки, `(app)/dashboard/DashboardBento.tsx`): слева **«Занятия сегодня»** (`TodayLessons`, шапка-ссылка → `/schedule`); центр — **генерация задания + вычитка** (`GeneratePanel`); справа — раскрытые мини-блоки **«Домашки»** и **«Долги»** (`MiniBlock`). В шапке — быстрые действия (`HeaderActions`): История (→ `/homework`), Ученики/«+ Занятие» (→ `/schedule`), «+ Оплата» (`QuickPaymentDialog`) и переключатель темы.
- **Данные — переиспуют существующие queries** (без новых таблиц): `listLessonsInRange`, `listBalances`, `listAssignments`, `listStudents`. Чистые derive-функции (`lib/dashboard/derive.ts`, покрыты тестами): `todayLessons` (фильтр по Europe/Moscow), `debtors`, `homeworkBuckets` (submitted → на проверку; assigned с прошедшим `due_date` → просрочено).
- **Центр (генерация+вычитка)** переиспует `lib/homework/` (`generateHomework`/`saveTemplate`) + новое `editHomework` → `folio-generate` `action:"edit"`. Все вызовы генерации идут через `lib/homework/` — **единая точка** контроля: `generateHomework` передаёт `workspace_id` в `folio-generate`, где проверяется **квота генераций** (#75, `folio_workspaces.generation_quota`, 402 → «лимит исчерпан») и пишется учёт расхода в `eb_llm_usage` (#23). Выдача квоты — в админке (блок «Квота генераций» в статистике воркспейса).
- **Тема:** `next-themes` `ThemeProvider` (`attribute="class"`, system default) в `[locale]/layout.tsx`; обе палитры — в `globals.css` (`:root` / `.dark`); компоненты используют только токены.
- **Идентичность:** сова-знак `src/app/icon.svg` (фавикон, заменяет дефолт create-next-app).

Отложено (полировка/будущее): визуальная полировка, инлайн quick-add занятия, назначение из черновика, дайджест (решено не делать), контроль генераций (#23).

## Hosting (Cloudflare Workers + OpenNext)

Веб-Folio задеплоен на **Cloudflare Workers** через адаптер **OpenNext** (`@opennextjs/cloudflare`):
`https://folio.vasiliy-garro.workers.dev` (2026-06-16, M-host). **Аккаунт Cloudflare:** `vasiliy.garro@gmail.com` (id `ea112105dc90594bac815e2e277aedea`) — тот же личный аккаунт, что и Supabase-проект `btlglelwxazdxfqdmcti` (English_bot). Полная карта аккаунтов/деплоя и предупреждение о проекте-двойнике — корневой [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

- **Сборка/деплой:** `npm run cf:deploy` (= `opennextjs-cloudflare build && deploy`). Конфиг — `wrangler.jsonc` (`nodejs_compat`, assets-binding `ASSETS` → `.open-next/assets`, observability). `.open-next/` и `.wrangler/` в `.gitignore`.
- **Middleware:** используем `middleware.ts` (Edge), НЕ `proxy.ts` — Next 16 привязывает `proxy` к Node-рантайму, который Workers не исполняет.
- **Env:** `NEXT_PUBLIC_*` зашиваются на этапе сборки из `.env.local`. Серверные секреты — как Worker-secrets (`wrangler secret put`): `SUPABASE_SECRET_KEY`, `FOLIO_GENERATE_SECRET`, `FOLIO_GENERATE_URL`. Supabase и Telegram-логин (deep-link) работают на любом домене без спец-настройки.
- **Smoke прод-деплоя:** `SMOKE_BASE_URL=<url> node scripts/smoke-render.mjs /ru/schedule`.
- **Отложено:** Workers Builds (авто-деплой из GitHub на push, root=`folio/`) и кастомный домен. Первый деплой — ручной (`cf:deploy`).
