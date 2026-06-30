@AGENTS.md

# Folio — CLAUDE.md

> Инструкции для Claude Code. Читать перед каждой задачей.
> Эти правила не обсуждаются и не нарушаются.

> Folio — расширение english-bot: общий репозиторий (`english_bot`), общий Supabase-проект (`btlglelwxazdxfqdmcti`).
> Архитектурные доки: `docs/MASTER_PROJECT.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`, ADR в `docs/00*.md`.

---

## Стек

> Версии — в `package.json`; архитектура и деплой — в `docs/ARCHITECTURE.md`. **Это НЕ тот Next.js, что в обучающих данных** (см. `AGENTS.md`): перед кодом сверяться с `node_modules/next/dist/docs/`.

- **Framework:** Next.js 16 (App Router, src-dir) + React 19
- **UI:** shadcn/ui + Tailwind CSS v4
- **Backend:** Supabase (Postgres + RLS + Edge Functions + Storage), тот же проект `btlglelwxazdxfqdmcti`
- **Language:** TypeScript (strict mode)
- **i18n:** next-intl, локали `ru`/`en`, сегмент `[locale]`
- **Генерация заданий (LLM):** Anthropic Claude (`claude-sonnet-4-6`) — **общий движок с english-bot** (`supabase/functions/_shared/generate.ts`), вызывается по HTTP через Edge Function `folio-generate`. OpenAI в проекте **не используется**
- **Events:** n8n — **запланировано (V2+), пока не внедрено**; событийные побочные эффекты сейчас best-effort в server actions
- **Hosting:** Cloudflare Workers через OpenNext (`npm run cf:deploy`); middleware на Edge — `middleware.ts`, НЕ `proxy.ts`
- **Runtime Edge Functions:** Deno (`folio-generate`, общие с ботом)

---

## Правила миграций БД

- **Никогда** не применять миграцию на production без локального теста через Supabase CLI
- Каждая миграция — отдельный файл с timestamp: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`
- После миграции обновить `docs/DATA_MODEL.md`
- RLS политика — обязательная часть каждой миграции с новой таблицей

---

## Безопасность — железные правила

- Каждая таблица имеет `workspace_id` + RLS политику на него
- `workspace_id` проверяется на уровне Edge Function, не только в RLS
- Никогда не доверять `user_id` из тела запроса — только из JWT токена
- Публичные роуты: только `/login`, `/invite/[token]`, `/` (лендинг)

---

## Архитектура

- **Бизнес-логика не в компонентах и не в боте** — только в shared слое (`/lib` или Edge Functions)
- **Bot Bridge** — english-bot пишет сгенерированные задания в `folio_homework_templates` (`source='bot'`, при скачивании PDF; см. `docs/superpowers/specs/2026-06-18-bot-web-homework-bridge-design.md`). Воркспейс резолвится из верифицированной Telegram-связки (`folio_auth_methods`→`folio_users`); аутентичность webhook обеспечивается `TELEGRAM_WEBHOOK_SECRET` (без него `from.id` спуфится)
- **Событийная логика** — пока в server actions (синхронно) / best-effort побочными эффектами; вынос в **n8n** — целевой замысел (V2+), не внедрён
- **Структура модуля** (фактическая): серверный слой — `src/lib/<module>/` (`schema.ts` zod, `queries.ts`, `actions.ts` с `"use server"`); роуты и UI — `src/app/[locale]/(app)/<route>/`. Бизнес-логика — в `lib/`, не в компонентах

---

## i18n

- **Два языка с первого дня:** RU (дефолт) + EN
- Каждый новый текстовый элемент = сразу ключ в обоих файлах
- Файлы: `/messages/ru.json`, `/messages/en.json`
- Пользовательские данные (имена, комментарии) — **никогда не переводить**
- Автодетект: из профиля пользователя, фоллбэк — RU

---

## Документация — обязательно в каждой задаче

По завершении задачи Claude Code обязан:
1. Обновить `docs/DATA_MODEL.md` если менялась схема БД
2. Обновить `docs/ARCHITECTURE.md` если менялась архитектура
3. Добавить ADR в `docs/` (`00N-*.md`, нумерация продолжает 001/002/003) если принималось архитектурное решение
4. Пополнить `docs/BACKLOG.md` если в процессе появились идеи/отложенные вещи
5. Обновить этот файл если менялись правила

**Задача не считается выполненной без обновления документации.**

---

## Что делегировать Gemini (высокообъёмный boilerplate)

✅ Можно:
- CRUD операции для новых таблиц
- Типы TypeScript из схемы БД
- UI компоненты по готовой спецификации
- SQL миграции по описанию таблицы

❌ Нельзя (только Claude):
- RLS политики
- Логика auth и инвайтов
- Bot Bridge и интеграции
- Модульные контракты (interfaces между модулями)
- Billing Tracker логика
- Любой код связанный с безопасностью или оплатой
- Cross-module stitching

---

## Commits — порядок по риску

1. Новые файлы и фичи (низкий риск)
2. Изменения существующей логики
3. Миграции БД
4. Изменения auth и security (высокий риск — последними)

---

## Запрещено

- `any` в TypeScript без явного комментария почему
- Прямые SQL запросы в компонентах (только через lib/ или Edge Functions)
- Хранить секреты в коде (только `.env.local` и Supabase secrets)
- Удалять данные без soft-delete или явного флага архивации
- Менять ставку занятия массово задним числом (только через конкретное занятие)
