# English Bot — Архитектура

## Обзор

```
Telegram → webhook → Supabase Edge Function (english-bot) → Anthropic API
                                   ↕
                             Supabase DB (Postgres + pgvector)
```

**Деплой:** `supabase functions deploy english-bot --no-verify-jwt`
**Проект:** `btlglelwxazdxfqdmcti` (production)
**Webhook URL:** `https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot`

---

## Файловая структура

```
supabase/functions/english-bot/
├── index.ts                    — точка входа: парсинг update, роутинг, обработка ошибок
├── lib/
│   ├── types.ts                — все TypeScript-типы (State, ModuleType, TgUpdate и др.)
│   ├── telegram.ts             — обёртки Telegram API (sendMessage, editMessageText, keyboard, mainMenu)
│   ├── claude.ts               — промпты и вызовы Anthropic API (generateModuleContent, generateTeacherGuide, applyEdit)
│   ├── db.ts                   — Supabase-запросы (сессии, пользователи, задания, инвайты)
│   ├── pdf.ts                  — генерация PDF через pdf-lib (A4, PT Sans, поддержка кириллицы)
│   ├── utils.ts                — makeFilename, makeTeacherFilename, splitIfLong, generateInviteCode, normalizeRequest
│   ├── module_detect.ts        — detectModule() и extractParams() из свободного текста пользователя
│   ├── utils.test.ts           — тесты utils
│   └── module_detect.test.ts   — тесты детекции модулей
└── handlers/
    ├── start.ts                — /start (регистрация + инвайт-код), /help, /new
    ├── request.ts              — WAITING_REQUEST: detectModule → CLARIFYING
    ├── clarify.ts              — экран параметров, buildClarifyMessage, handleTopicInput
    ├── generate.ts             — generateAndSend, кэш, handleUseCached, handleGenerateNew
    ├── edit.ts                 — EDITING: применить правки через Claude
    ├── pdf_download.ts         — отправка PDF(ов) + сохранение задания в БД
    └── admin.ts                — /invite, /users, /setup (только ADMIN_USER_ID)
```

---

## Машина состояний (State Machine)

```
REGISTERING      — новый пользователь вводит инвайт-код
WAITING_REQUEST  — ждёт текстовый запрос от пользователя
CLARIFYING       — показан экран выбора параметров (тип/уровень/возраст/версия)
WAITING_TOPIC    — параметры выбраны через меню, ждёт тему задания
CACHE_OFFER      — найдено похожее задание, предлагает использовать или сгенерировать новое
POST_GENERATION  — задание показано, ждёт действия (правки / PDF / новое)
EDITING          — ждёт текст с правками к заданию
```

Переходы:

```
/start (новый)   → REGISTERING
/start (admin/known) → WAITING_REQUEST
ввод инвайт-кода → WAITING_REQUEST

текст в WAITING_REQUEST → CLARIFYING
кнопка "📝 Сформировать задание" → CLARIFYING (без last_request)

кнопки параметров (clr_*) → CLARIFYING (update params, re-render)
"✅ Генерировать" + last_request есть → CACHE_OFFER или POST_GENERATION
"✅ Генерировать" + last_request пуст → WAITING_TOPIC
текст в WAITING_TOPIC → POST_GENERATION

"✅ Использовать это" (кэш) → POST_GENERATION
"🔄 Сгенерировать новое" → POST_GENERATION

"✏️ Поправить что-то" → EDITING
текст в EDITING → POST_GENERATION
"📄 Скачать PDF" → (остаётся POST_GENERATION, шлёт файл)
"🆕 Новое задание" → WAITING_REQUEST
```

---

## Типы модулей

| Тип | Константа | Описание |
|-----|-----------|----------|
| Reading | `READING_MODULE` | Авторский текст + 8 видов упражнений (TF, Comprehension, MCQ, Gap fill, Word formation, Matching, Error correction, Key word transformation) |
| Vocabulary | `VOCABULARY_MODULE` | Словарный список 15–18 единиц + 7 упражнений, без текста для чтения |
| Translation (тексты) | `TRANSLATION_TEXTS` | 4–5 жанровых текстов на русском для перевода (аналитика, публицистика, официальный стиль, статистика, непереводимое) |
| Translation (предложения) | `TRANSLATION_SENTENCES` | 3–4 блока по грамматической теме, 8–12 предложений каждый |

**Teacher's Guide** — только для Reading и Vocabulary. Генерируется отдельным вызовом Claude (`generateTeacherGuide`), отдаётся вторым PDF.

**Детекция модуля** — `detectModule()` в `lib/module_detect.ts` определяет тип по ключевым словам из свободного запроса (vocabulary/лексика → VOCABULARY_MODULE, перевод/translation + текст → TRANSLATION_TEXTS и т.д.).

---

## Флоу создания задания

### Через текстовый запрос (основной)

```
Пользователь пишет запрос (напр. "B2, бизнес, взрослый")
  → handleRequest: detectModule() + extractParams()
  → CLARIFYING + buildClarifyMessage() — inline keyboard с параметрами
  → tap clr_type_* / clr_level_* / clr_age_* / clr_ver_*
  → handleClarifyParam: update params + editMessageText (re-render keyboard)
  → tap "✅ Генерировать" → handleClarifyConfirm
  → findSimilarAssignment (pgvector cosine ≥ 0.85) → CACHE_OFFER или прямо в генерацию
  → generateAndSend → Claude API → POST_GENERATION
  → кнопки: Поправить / Скачать PDF / Новое задание
```

### Через кнопку меню

```
"📝 Сформировать задание"
  → handleNewFromMenu: CLARIFYING, last_request=""
  → выбор параметров
  → "✅ Генерировать" → last_request пустой → WAITING_TOPIC
  → "Напиши тему задания:"
  → handleTopicInput → generateAndSend → POST_GENERATION
```

---

## База данных

| Таблица | Назначение |
|---------|-----------|
| `eb_users` | Зарегистрированные пользователи (telegram_id, name, username, invited_by) |
| `eb_sessions` | Текущая сессия пользователя (state + context JSON) |
| `eb_assignments` | Кэш сгенерированных заданий с pgvector embedding (vector 384) |
| `eb_invitations` | Инвайт-коды (code, created_by, used_by, used_at) |

**Кэш**: embedding = `level + topic + ageGroup` через `gte-small` (Supabase AI). Поиск через `match_assignments` RPC — косинусное сходство, порог 0.85, фильтр по `module_type`. Задание попадает в кэш только при скачивании PDF (пользователь одобрил).

---

## Reply Keyboard (постоянное меню)

```
[▶️ Старт]  [❓ Справка]
[📝 Сформировать задание]
```

Показывается после `/start`, `/help`, `/new`, после успешной регистрации.

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

# Задать/обновить секрет
supabase secrets set ANTHROPIC_KEY=sk-ant-...

# Проверить статус webhook
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool

# Зарегистрировать webhook
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot"}'

# Запустить тесты
deno test supabase/functions/english-bot/lib/ --allow-env

# Посмотреть логи Edge Function
supabase functions logs english-bot --tail
```

---

## Известные особенности

- `eb_sessions` не имеет FK на `eb_users` намеренно: неавторизованные пользователи тоже получают сессию `REGISTERING`
- Embedding может вернуть `null` если Supabase AI недоступен — в этом случае кэш пропускается, генерируется новое задание
- После редактирования (`EDITING`) teacher content сбрасывается: кнопка PDF не показывает "студент + учитель"
- Шрифт PT Sans кешируется в памяти инстанса Edge Function (`cachedFontBytes`)
