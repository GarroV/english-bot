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
мягкая архивация/восстановление. Роут `/[locale]/students`.

- **Серверный слой** `lib/students/`:
  - `schema.ts` — zod `studentInputSchema` (name обязателен; email/telegramId/defaultRate/notes опциональны).
  - `queries.ts` — `listStudents(includeArchived)`.
  - `actions.ts` — `createStudent` / `updateStudent` / `archiveStudent` / `restoreStudent`
    (`"use server"`). `workspace_id` берётся из строки `folio_users` сессионного юзера,
    **никогда** из клиента; запись идёт через request-scoped серверный клиент, чтобы
    применялась RLS.
- **UI** (`(app)/students/`): `page.tsx` (server, auth-guard через `getUser`, читает `?archived`),
  `StudentsTable.tsx` (client, shadcn Table + фильтр архива + row actions),
  `StudentForm.tsx` (client, shadcn Dialog, create/edit, sonner toasts). `<Toaster/>`
  смонтирован в `[locale]/layout.tsx`.
- **Архивация** — мягкая (`archived_at`, восстановимо). PII-скраб и логин/инвайты ученика
  отложены.

Таблица и RLS — в [[DATA_MODEL]] (`folio_students`).
