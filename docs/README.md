# English Bot

Telegram-бот для преподавателей английского — генерирует учебные задания через Claude AI. Работает как Supabase Edge Function на Deno.

## Что умеет

- Генерирует 4 типа заданий: **Reading**, **Vocabulary**, **Translation (тексты)**, **Translation (предложения)**
- Уровни A2–C2, возраст: подросток / молодой взрослый / взрослый
- Опциональная **версия для учителя** (Teacher's Guide с ответами) для Reading и Vocabulary
- **Кэш заданий** через pgvector — при похожем запросе предлагает готовое задание
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
```

### 3. Задеплоить функцию

```bash
supabase functions deploy english-bot --no-verify-jwt
```

### 4. Зарегистрировать webhook

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot"}'
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
| `/start` | Запуск / регистрация | все |
| `/help` | Справка | зарегистрированные |
| `/new` | Новое задание | зарегистрированные |
| `/invite` | Создать инвайт-код | только admin |
| `/users` | Список пользователей | только admin |
| `/setup` | Обновить меню команд Telegram | только admin |

## Документация

| Файл | Содержание |
|------|-----------|
| [BOT.md](BOT.md) | Архитектура, state machine, флоу генерации |
| [CHANGELOG.md](CHANGELOG.md) | История изменений |
| [BACKLOG.md](BACKLOG.md) | Планы и технический долг |
