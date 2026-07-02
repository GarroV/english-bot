# English Bot — Инструкции для Claude

Репозиторий содержит два связанных проекта в одном git-корне:

- **English Bot** (корень + `supabase/functions/english-bot`) — Telegram-бот генерации учебных заданий по английскому. Deno / Supabase Edge Function, TypeScript, Anthropic Claude.
- **Folio** (`Folio/`) — веб-приложение для преподавателей (Next.js 16 + shadcn/ui, хостинг Cloudflare через OpenNext). У него **свои** `Folio/CLAUDE.md` и `Folio/AGENTS.md` — при работе внутри `Folio/` следовать им, этот файл не дублировать и те не ломать.

Оба проекта делят один Supabase-проект (`btlglelwxazdxfqdmcti`) и общий LLM-движок (`supabase/functions/_shared/generate.ts`).

## Инфраструктура и аккаунты (сверять ПЕРЕД каждым деплоем/миграцией)

Всё на **личном** аккаунте `vasiliy.garro@gmail.com` — это НЕ рабочий dodobrands (`v.garro@dodobrands.io` встречается только как email супер-админа в данных Folio, не как аккаунт хостинга/БД).

- **Supabase:** проект `btlglelwxazdxfqdmcti` (**English_bot**, орг `lvfrdaovqwbuakyujbtg`, регион `eu-central-1`). ⚠️ В ТОМ ЖЕ аккаунте есть второй проект `vbqglndbxkpmreccpqmr` («GarroV's Project») — **это НЕ он**. Всегда `--project-ref btlglelwxazdxfqdmcti`; сверяй ref в каждой команде и в URL Management-API.
- **Cloudflare** (хостинг Folio): аккаунт `vasiliy.garro@gmail.com` (id `ea112105dc90594bac815e2e277aedea`), воркер `folio` → `folio.vasiliy-garro.workers.dev`.
- **Telegram-бот:** `@garro_oracle_bot` (id `8080425387`).

Полная карта (деплой-команды, GitHub-репо, `.env`-креды) — `docs/README.md` § «Инфраструктура и аккаунты» (единый источник).

---

## Стек (English Bot)

- **Runtime:** Deno / Supabase Edge Function
- **Язык:** TypeScript
- **LLM:** Anthropic `claude-sonnet-4-6` — константа `MODEL` в `supabase/functions/_shared/generate.ts` (общий движок бота и Folio; `lib/claude.ts` — ре-экспорт)
- **БД:** Supabase Postgres + pgvector (`lib/db.ts`)
- **Интерфейс:** Telegram Bot API (webhook)
- **PDF:** pdf-lib + fontkit

---

## Перед изменением кода

1. **Читать `docs/BOT.md`** — архитектура, машина состояний, флоу генерации, типы модулей, таблицы БД, команды, env. За общим описанием — `docs/README.md`.
2. После изменения — сразу отразить новое в `docs/BOT.md` (handler/lib-модуль, состояние сессии, тип модуля, таблица, команда, env). Если флоу изменился, а док — нет, задача **не закрыта**.
3. **Type-check перед коммитом:** `deno check` затронутых файлов (бот) / `npm run build` в `Folio/` (веб). Красный type-check не коммитим.
4. Тесты бота: `deno test supabase/functions/english-bot/lib/ --allow-env`.

---

## Рабочий процесс

- **Не коммитить напрямую в `main`.** Любое изменение — через фича-ветку → PR → merge. Ветка от актуального `main`: `git checkout -b feat/<краткое-имя>`.
- **Conventional commits строго:** `feat / fix / refactor / docs / test / chore / perf / ci`, со скоупом проекта где уместно: `feat(bot): …`, `fix(folio): …`. Описание — по сути изменения: commit-сообщения = история проекта.
- **Коммит = одно логически завершённое изменение.** Не копить несколько правок в одном коммите. После завершённого изменения — сразу коммит и `git push`.
- Перед PR: type-check зелёный, тесты проходят, ветка свежая относительно `main`.

---

## Деплой

После изменения кода бота — **деплоить сразу**, не откладывать:

```bash
supabase functions deploy english-bot --no-verify-jwt
```

`--no-verify-jwt` обязателен: Telegram шлёт webhook без JWT, иначе функция вернёт 401. Задача не считается выполненной, пока изменение не задеплоено.

Folio деплоится отдельно из `Folio/` (`npm run cf:deploy` — OpenNext → Cloudflare Workers).

---

## Стиль кода

- Короткий комментарий над каждой функцией (одна строка — что делает)
- Без лишних абстракций, без feature flags
- Ошибки валидируются только на границах (Telegram update, Supabase response)
- Валидировать любой внешний вход (тело webhook, ответ Supabase, ответ LLM) до использования

---

## Безопасность — жёсткие правила

- **Секреты — никогда в коде.** Только Supabase secrets (`supabase secrets set …`) или `.env` (он в `.gitignore` — не коммитить). Ключевые: `ANTHROPIC_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_USER_ID`, `TELEGRAM_WEBHOOK_SECRET`.
- **Webhook-аутентификация обязательна.** `index.ts` сверяет заголовок `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET` и отклоняет (403) поддельные запросы. Без проверки `from.id` спуфится — на нём держится резолв воркспейса для Bot Bridge (запись заданий в `folio_homework_templates`). Не ослаблять.
- **Доступ — только через инвайт-систему.** Новых пользователей добавлять через `/invite` (только admin). Прямая вставка в БД обходит логику `useInvite` / `registerUser` — не использовать.

---

## Безопасность БД и миграции

- Каждая миграция — отдельный файл `supabase/migrations/YYYYMMDDHHMMSS_description.sql`. Применять `supabase db push` / `supabase migration up`.
- Перед prod — проверить миграцию локально через Supabase CLI.
- Таблицы с RLS (особенно Folio) — RLS-политика обязательная часть миграции с новой таблицей.
- `ADD COLUMN` — безопасно, делать сразу.
- `DROP COLUMN`, `RENAME COLUMN`, `ALTER TYPE` — **только в два шага**: сначала убрать из кода → деплой → потом менять схему.
- **Никогда** `DELETE FROM` / `UPDATE` без `WHERE` — даже в миграциях.
- После миграции обновить раздел БД в `docs/BOT.md` (и `Folio/docs/DATA_MODEL.md`, если затронут Folio).

---

## Документация

При каждом изменении кода держать актуальными:

- **`docs/BOT.md`** — архитектура: handlers, lib-модули, состояния сессии, типы модулей, таблицы, команды, env.
- **`docs/CHANGELOG.md`** — запись при каждом изменении кода. Новые записи **в начало**, под `# Changelog`, формат:
  ```markdown
  ## YYYY-MM-DD

  ### тип: краткое описание

  Один-два абзаца: что изменилось и почему. Для fix — симптом и причина.
  ```
- **`docs/BACKLOG.md`** — реализовал фичу из беклога → удалить; нашёл техдолг → добавить в «Технический долг»; новые идеи — по приоритету.
- **`docs/README.md`** — при изменении команд бота, env-переменных, шагов деплоя.

---

## Карта файлов

```
supabase/
  functions/
    _shared/generate.ts      LLM-движок (MODEL, генерация) — общий с Folio
    english-bot/
      index.ts               вход: webhook, проверка secret-token, роутинг
      handlers/              start, request, clarify, generate, edit,
                             history, pdf_download, admin
      lib/                   db, claude, telegram, types, utils,
                             module_detect, pdf, folio_login (+ *.test.ts)
    folio-generate/index.ts  Edge Function веб-приложения Folio
  migrations/                YYYYMMDDHHMMSS_*.sql
  config.toml
docs/                        BOT.md, README.md, CHANGELOG.md, BACKLOG.md
Folio/                       Next.js-приложение (свои CLAUDE.md / AGENTS.md / docs/)
deno.json                    task: test
```
