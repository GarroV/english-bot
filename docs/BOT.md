# English Bot — Документация

Telegram-бот для генерации учебных заданий по английскому через Claude. Работает как Supabase Edge Function.

---

## Архитектура

```
Telegram → webhook → Supabase Edge Function (english-bot) → Anthropic API
                                    ↕
                              Supabase DB (Postgres + pgvector)
```

**Деплой:** `supabase functions deploy english-bot --no-verify-jwt`  
**Проект:** `btlglelwxazdxfqdmcti` (production)  
**Webhook URL:** `https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot`

---

## Состояния сессии (State machine)

```
REGISTERING      — новый пользователь вводит инвайт-код
WAITING_REQUEST  — ждёт текстовый запрос от пользователя
CLARIFYING       — показан экран выбора параметров (тип/уровень/возраст/версия)
WAITING_TOPIC    — параметры выбраны через меню, ждёт тему задания
CACHE_OFFER      — найдено похожее задание, предлагает использовать или сгенерировать новое
POST_GENERATION  — задание показано, ждёт действия (правки / PDF / новое)
EDITING          — ждёт текст с правками к заданию
```

---

## Типы модулей

| Тип | Константа | Описание |
|-----|-----------|----------|
| Reading | `READING_MODULE` | Авторский текст + 8 видов упражнений (TF, Comprehension, MCQ, Gap fill и др.) |
| Vocabulary | `VOCABULARY_MODULE` | Словарный список + упражнения, без текста для чтения |
| Translation (тексты) | `TRANSLATION_TEXTS` | 4–5 связных текстов на русском по жанрам для перевода |
| Translation (предложения) | `TRANSLATION_SENTENCES` | Блоки предложений по грамматическим темам для перевода |

**Версия с ответами** (Teacher's Guide) — только для Reading и Vocabulary. Генерируется отдельным вызовом Claude и отдаётся вторым PDF.

---

## Файловая структура

```
supabase/functions/english-bot/
├── index.ts                — роутер: Telegram update → handler
├── lib/
│   ├── types.ts            — все TypeScript типы (State, ModuleType, TgUpdate и др.)
│   ├── telegram.ts         — обёртки Telegram API (sendMessage, keyboard, mainMenu и др.)
│   ├── claude.ts           — промпты и вызовы Anthropic API
│   ├── db.ts               — запросы к Supabase (сессии, пользователи, задания)
│   ├── pdf.ts              — генерация PDF через pdf-lib
│   ├── utils.ts            — makeFilename, splitIfLong, generateInviteCode и др.
│   ├── module_detect.ts    — detectModule() и extractParams() из свободного текста
│   ├── utils.test.ts       — тесты utils
│   └── module_detect.test.ts — тесты детекции модулей
└── handlers/
    ├── start.ts            — /start, /help, /new, инвайт-код
    ├── request.ts          — обработка текстового запроса → CLARIFYING
    ├── clarify.ts          — экран параметров, handleNewFromMenu, handleTopicInput
    ├── generate.ts         — генерация задания через Claude, кэш
    ├── edit.ts             — правки задания
    ├── pdf_download.ts     — отправка PDF(ов)
    └── admin.ts            — /invite, /users, /setup (только ADMIN_USER_ID)
```

---

## Флоу создания задания

### Через текстовый запрос (основной флоу)
```
Пользователь пишет текст
  → handleRequest: detectModule() + extractParams()
  → CLARIFYING + buildClarifyMessage() с кнопками
  → пользователь жмёт параметры (clr_type_*, clr_level_*, clr_age_*, clr_ver_*)
  → handleClarifyParam: обновляет параметры, перерисовывает сообщение
  → "✅ Генерировать" → handleClarifyConfirm
  → (для Reading/Vocab) ищет похожие в кэше → CACHE_OFFER или генерация
  → generateAndSend → Claude API → POST_GENERATION
  → кнопки: Поправить / Скачать PDF / Новое задание
```

### Через кнопку меню (📝 Сформировать задание)
```
  → handleNewFromMenu: CLARIFYING, last_request=""
  → пользователь выбирает тип/уровень/возраст/версию
  → "✅ Генерировать" → handleClarifyConfirm: last_request пустой → WAITING_TOPIC
  → "Напиши тему задания:"
  → handleTopicInput → generateAndSend → ...
```

---

## Reply keyboard (постоянное меню снизу)

Показывается после /start, /help, /new, после регистрации:

```
[▶️ Старт]  [❓ Справка]
[📝 Сформировать задание]
```

---

## База данных (таблицы)

| Таблица | Назначение |
|---------|-----------|
| `eb_users` | Зарегистрированные пользователи (telegram_id, name, username) |
| `eb_sessions` | Текущая сессия пользователя (state + context JSON) |
| `eb_assignments` | Кэш сгенерированных заданий с pgvector embeddings |
| `eb_invitations` | Инвайт-коды (code, created_by, used_by) |

Кэш работает через `pgvector` — косинусное сходство по embedding = `level + topic + ageGroup`. Порог: 0.85.

---

## Секреты Supabase (production)

| Переменная | Назначение |
|------------|-----------|
| `ANTHROPIC_KEY` | Ключ Anthropic API |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота |
| `ADMIN_USER_ID` | Telegram ID администратора |
| `SUPABASE_URL` | URL проекта (auto-injected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ключ Supabase (auto-injected) |

---

## Частые операции

```bash
# Задеплоить функцию
supabase link --project-ref btlglelwxazdxfqdmcti
supabase functions deploy english-bot --no-verify-jwt

# Установить секрет
supabase secrets set ANTHROPIC_KEY=sk-ant-...

# Проверить статус webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Запустить тесты
deno test supabase/functions/english-bot/lib/ --allow-env
```
