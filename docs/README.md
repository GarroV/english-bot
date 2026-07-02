# English Bot

Telegram-бот для преподавателей английского — генерирует учебные задания через Claude AI. Работает как Supabase Edge Function на Deno.

## Что умеет

- Генерирует 5 типов заданий: **Reading**, **Vocabulary**, **Перевод (тексты)**, **Перевод (предложения)**, **Глаголы (предложения)**
- Уровни A2–C2, возраст: подросток / молодой взрослый / взрослый
- Опциональная **версия для учителя** (Teacher's Guide с ответами) для Reading и Vocabulary
- **История заданий** — сгенерированные сохраняются (`/history`, повторное скачивание PDF)
- Экспорт в **PDF** (PT Sans, поддержка кириллицы)
- Инвайт-система — доступ только по одноразовому коду от администратора
- Редактирование сгенерированного задания через Claude

## Стек

| Слой | Технология |
|------|-----------|
| Runtime | Deno / Supabase Edge Function |
| LLM | Anthropic Claude (`claude-sonnet-4-6`, константа `MODEL` в `_shared/generate.ts`) |
| База данных | Supabase Postgres + pgvector |
| Интерфейс | Telegram Bot API (webhook) |
| PDF | pdf-lib + fontkit |

## Инфраструктура и аккаунты (где и как хранится проект)

> **Единый источник правды.** Весь проект — на **личном** Google-аккаунте `vasiliy.garro@gmail.com`. Это НЕ рабочий `dodobrands`: `v.garro@dodobrands.io` встречается только как email супер-админа **в данных** Folio (seed), а не как аккаунт хостинга/БД.

| Что | Где | Идентификатор |
|-----|-----|---------------|
| Код | GitHub | `GarroV/english-bot` (монорепо: бот + Folio) |
| БД + Edge Functions | **Supabase**, проект **English_bot** | ref `btlglelwxazdxfqdmcti` · регион `eu-central-1` · орг `lvfrdaovqwbuakyujbtg` · аккаунт `vasiliy.garro@gmail.com` |
| Хостинг Folio (веб) | **Cloudflare Workers** (OpenNext) | воркер `folio` → `folio.vasiliy-garro.workers.dev` · аккаунт `vasiliy.garro@gmail.com` (id `ea112105dc90594bac815e2e277aedea`) |
| Telegram-бот | Telegram Bot API | `@garro_oracle_bot` (id `8080425387`) |

> ⚠️ **Двойник Supabase-проекта.** В ТОМ ЖЕ аккаунте есть второй проект `vbqglndbxkpmreccpqmr` («GarroV's Project») — он **не относится** к English_bot/Folio. Всегда деплой/миграции только в `btlglelwxazdxfqdmcti`; сверяй ref в каждой команде и URL.

**Деплой** (креды в gitignored корневом `.env`: `SUPABASE_ACCESS_TOKEN` — PAT для Management API, `TELEGRAM_BOT_TOKEN`; wrangler залогинен под gmail-аккаунт):
- Edge Functions (бот / `folio-generate` / `folio-homework-pdf`): `supabase functions deploy <name> --no-verify-jwt --project-ref btlglelwxazdxfqdmcti`
- Миграции: `POST https://api.supabase.com/v1/projects/btlglelwxazdxfqdmcti/database/query` (Bearer PAT) + запись в `supabase_migrations.schema_migrations`
- Folio (веб): из `Folio/` → `npm run cf:deploy`

## Быстрый старт

### 1. Привязать проект

```bash
supabase link --project-ref btlglelwxazdxfqdmcti
```

### 2. Задать секреты

```bash
supabase secrets set ANTHROPIC_KEY=sk-ant-...
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase secrets set ADMIN_USER_ID=...
# Webhook-аутентификация: значение ДОЛЖНО совпадать с secret_token в setWebhook (шаг 4)
supabase secrets set TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
# (опц.) URL веб-кабинета Folio для кнопки «🌐 Открыть Folio»; дефолт — прод-URL
supabase secrets set FOLIO_WEB_URL=https://folio.vasiliy-garro.workers.dev
```

> Репозиторий содержит и вторую Edge Function — **`folio-generate`** (общий движок генерации по HTTP для веб-приложения Folio, закрыта секретом `FOLIO_GENERATE_SECRET`, переиспользует `ANTHROPIC_KEY`). Деплоится отдельно (`supabase functions deploy folio-generate --no-verify-jwt`); её настройка и секреты описаны в документации Folio (`Folio/docs/ARCHITECTURE.md`).

### 3. Задеплоить функцию

```bash
supabase functions deploy english-bot --no-verify-jwt
```

### 4. Зарегистрировать webhook

```bash
# secret_token ДОЛЖЕН совпадать с TELEGRAM_WEBHOOK_SECRET — Telegram шлёт его в заголовке
# X-Telegram-Bot-Api-Secret-Token, index.ts проверяет его и отклоняет (403) поддельные запросы
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
```

### 5. Запустить тесты

```bash
deno test supabase/functions/english-bot/lib/ --allow-env
```

## Добавить пользователя

1. Отправь боту `/invite` — получишь одноразовый код
2. Передай код пользователю
3. Пользователь пишет `/start` и вводит код

## Команды бота

| Команда | Описание | Доступ |
|---------|----------|--------|
| `/start` | Запуск / регистрация (+ deep-link входа в Folio `folio_login_<token>`) | все |
| `/help` | Справка | зарегистрированные |
| `/new` | Новое задание | зарегистрированные |
| `/history` | Последние 5 заданий + повторное скачивание PDF | зарегистрированные |
| `/invite` | Создать инвайт-код | только admin |
| `/users` | Список пользователей | только admin |
| `/usage` | Расход LLM за текущий месяц по пользователям | только admin |
| `/setup` | Обновить меню команд Telegram | только admin |

## Документация

| Файл | Содержание |
|------|-----------|
| [BOT.md](BOT.md) | Архитектура, state machine, флоу генерации |
| [CHANGELOG.md](CHANGELOG.md) | История изменений |
| [BACKLOG.md](BACKLOG.md) | Планы и технический долг |
