# Folio

Рабочая платформа репетитора английского: ученики, расписание, учёт денег, журнал занятий, домашние задания и прогресс — в одном веб-кабинете. Folio — расширение [english-bot](../README.md): общий репозиторий, общий Supabase-проект (`btlglelwxazdxfqdmcti`) и общий движок генерации заданий.

Прод: **https://folio.vasiliy-garro.workers.dev** (Cloudflare Workers).

## Стек

| Слой | Технология |
|------|-----------|
| Фреймворк | Next.js 16 (App Router, src-dir) + React 19 |
| UI | shadcn/ui + Tailwind CSS v4 |
| i18n | next-intl (`ru` дефолт / `en`), сегмент `[locale]` |
| Бэкенд | Supabase (Postgres + RLS + Auth + Edge Functions) |
| Генерация заданий | Anthropic Claude — общий движок с ботом (`supabase/functions/_shared/generate.ts`) по HTTP через Edge Function `folio-generate` |
| Хостинг | Cloudflare Workers через OpenNext (`@opennextjs/cloudflare`) |

## Поверхности (роуты)

| Роут | Назначение | Доступ |
|------|-----------|--------|
| `/[locale]` | Лендинг | публичный |
| `/[locale]/login` | Вход через Telegram (deep-link + одноразовый токен) | публичный |
| `/[locale]/invite/[token]` | Self-serve регистрация репетитора по инвайту | публичный |
| `/[locale]/schedule` | Недельное расписание + панель учеников + журнал | tutor |
| `/[locale]/billing` | Учёт денег (начисления/оплаты, баланс) | tutor |
| `/[locale]/homework` | Генерация заданий, шаблоны, назначение ученикам | tutor |
| `/[locale]/admin` | Супер-админ: инвайты репетиторов + обзор воркспейсов | super_admin |
| `/api/auth/telegram/{start,status,session}` | Бэкенд Telegram-логина | — |

## Главный сценарий

Репетитор входит через Telegram → ведёт расписание (создаёт занятия solo/группа, отмечает «состоялось») → начисление автоматически попадает в леджер → после занятия заполняет журнал → генерирует домашку (или она прилетает из бота при скачивании PDF) и назначает её ученикам.

## Запуск локально

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run lint
```

Нужен `.env.local` (см. `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `FOLIO_GENERATE_URL`, `FOLIO_GENERATE_SECRET`.

## Деплой (Cloudflare Workers)

```bash
npm run cf:deploy          # opennextjs-cloudflare build && deploy
```

Серверные секреты — как Worker-secrets (`wrangler secret put`): `SUPABASE_SECRET_KEY`, `FOLIO_GENERATE_SECRET`, `FOLIO_GENERATE_URL`. `NEXT_PUBLIC_*` зашиваются на этапе сборки из `.env.local`. Смоук прод-деплоя: `SMOKE_BASE_URL=<url> node scripts/smoke-render.mjs /ru/schedule`.

> Middleware — `middleware.ts` (Edge), **не** `proxy.ts`: Next 16 привязывает `proxy` к Node-рантайму, который Workers не исполняют.

## Документация

| Файл | Содержание |
|------|-----------|
| [docs/MASTER_PROJECT.md](docs/MASTER_PROJECT.md) | Продуктовая картина: видение, модули, принципы |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Технические решения, модули, деплой |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Схема БД, таблицы, RLS |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Статусы вех (M1–M9) |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Идеи, отложенные фичи, технический долг |
| [docs/001-stack.md](docs/001-stack.md) … `003-*` | ADR (архитектурные решения) |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | Правила для Claude Code |
