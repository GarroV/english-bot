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
├── index.ts                    — точка входа: проверка webhook secret (X-Telegram-Bot-Api-Secret-Token), парсинг update, роутинг, обработка ошибок
├── lib/
│   ├── types.ts                — все TypeScript-типы (State, ModuleType, TgUpdate и др.)
│   ├── telegram.ts             — обёртки Telegram API (sendMessage, editMessageText, keyboard, mainMenu)
│   ├── claude.ts               — тонкий ре-экспорт движка генерации из `_shared/generate.ts` (см. примечание ниже)
│   ├── db.ts                   — Supabase-запросы (сессии, пользователи, задания, инвайты; мост в Folio: resolveFolioWorkspace, saveFolioTemplateFromBot)
│   ├── pdf.ts                  — генерация PDF через pdf-lib (A4, PT Sans, поддержка кириллицы)
│   ├── utils.ts                — makeFilename, makeTeacherFilename, splitIfLong, generateInviteCode, normalizeRequest, extractTopic, timingSafeEqual
│   ├── module_detect.ts        — detectModule(), extractParams(), extractVerb() из свободного текста пользователя
│   ├── folio_login.ts          — parseLoginPayload(): разбор deep-link `folio_login_<token>` для входа в Folio
│   ├── utils.test.ts           — тесты utils
│   ├── module_detect.test.ts   — тесты детекции модулей
│   └── folio_login.test.ts     — тесты разбора login-payload
└── handlers/
    ├── start.ts                — /start (регистрация + инвайт-код), /help, /new; на payload `folio_login_` шлёт запрос-подтверждение (кнопки); handleFolioConfirm/handleFolioCancel → confirmFolioLogin (#4)
    ├── request.ts              — WAITING_REQUEST: detectModule/extractParams → CLARIFYING (старт визарда); handleChangeRequest
    ├── clarify.ts              — визард параметров: buildWizardMessage, handleWizardStep (wiz_*); handleTopicInput, handleVerbInput
    ├── generate.ts             — generateAndSend, sendAssignment, handleNewAssignment; handleUseCached/handleGenerateNew (кэш-оффер — мёртвый путь, см. ниже)
    ├── edit.ts                 — EDITING: применить правки через Claude
    ├── pdf_download.ts         — отправка PDF(ов) + сохранение в кэш eb_assignments + зеркалирование в библиотеку Folio (мост бот→веб)
    ├── history.ts              — /history: список последних 5 заданий + повторное скачивание PDF
    └── admin.ts                — /invite, /users, /setup (только ADMIN_USER_ID)
```

> **Движок генерации (shared с Folio):** промпты + `generateModuleContent` / `generateTeacherGuide` / `applyEdit` вынесены в `supabase/functions/_shared/generate.ts` (Deno + Anthropic). `lib/claude.ts` — тонкий ре-экспорт из `_shared`. Тот же движок выставлен по HTTP для веб-Folio через Edge Function `folio-generate` — оба потребителя гоняют идентичный код, без дрейфа промптов.

---

## Машина состояний (State Machine)

Текущий флоу — пошаговый **визард** на inline-кнопках (`wiz_*`): после свободного запроса бот ведёт по шагам тип → [версия] → уровень → возраст и запускает генерацию сразу на последнем шаге (без отдельной кнопки «Генерировать»).

```
REGISTERING      — новый пользователь вводит инвайт-код
WAITING_REQUEST  — ждёт текстовый запрос от пользователя
CLARIFYING       — идёт визард параметров (wizard_step: type → version → level → age)
WAITING_VERB     — для VERB_SENTENCES: ждёт текст с целевым глаголом
POST_GENERATION  — задание показано, ждёт действия (правки / PDF / новое)
EDITING          — ждёт текст с правками к заданию
```

> **Мёртвые состояния:** `WAITING_TOPIC` и `CACHE_OFFER` объявлены в типе `State`, но в текущем флоу недостижимы — как и callback'и `use_cached`/`generate_new` (хендлеры `handleUseCached`/`handleGenerateNew` существуют и роутятся в `index.ts`, но кнопки кэш-оффера нигде не создаются, а `findSimilarAssignment` не вызывается). Это мёртвый путь, помеченный к удалению — см. `BACKLOG.md`. Кэш `eb_assignments` пишется при скачивании PDF, но обратно в диалог не предлагается.

Переходы:

```
/start (новый)        → REGISTERING
/start (admin/known)  → WAITING_REQUEST (+ сообщение с кнопкой «🌐 Открыть Folio»)
/start folio_login_<token> → НЕ подтверждает сразу: шлёт запрос с предупреждением и кнопками
                         «✅ Подтвердить вход» (folio_confirm_<token>) / «❌ Отмена» (folio_cancel_<token>)
                         — защита от login-CSRF (#4). confirmFolioLogin вызывается только по нажатию
                         «Подтвердить» (handleFolioConfirm). Если Telegram не привязан, но токен несёт
                         валидный signup-инвайт — подтверждает для регистрации репетитора
                         (исход invite_expired, если инвайт протух). Иначе обычный путь /start
folio_confirm_<token> / folio_cancel_<token> → роутятся в index.ts ДО гейта isAllowed
                         (Folio-юзер может быть не в allowlist бота)
ввод инвайт-кода (REGISTERING) → WAITING_REQUEST

текст в WAITING_REQUEST → CLARIFYING (handleRequest: detectModule + extractParams, wizard_step=type)
📝 Новое задание / 🆕 Новое задание → WAITING_REQUEST (просит написать запрос)

wiz_type_*   → set module_type; next = version (Reading/Vocabulary) или level (остальные)
wiz_ver_*    → set version → level   (шаг version — только для Reading/Vocabulary)
wiz_level_*  → set level → age
wiz_age_*    → set ageGroup → генерация сразу → POST_GENERATION
               (если VERB_SENTENCES и глагол ещё не задан → WAITING_VERB)
текст в WAITING_VERB → генерация → POST_GENERATION

"✏️ Поправить что-то" (edit_assignment) → EDITING
текст в EDITING → применяет правку через Claude → POST_GENERATION
"📄 Скачать PDF" (download_pdf) → остаётся POST_GENERATION, шлёт файл(ы) + пишет кэш + мост в Folio
"🆕 Новое задание" (new_assignment) → WAITING_REQUEST
```

---

## Типы модулей

| Тип | Константа | Описание |
|-----|-----------|----------|
| Reading | `READING_MODULE` | Авторский текст + 8 видов упражнений (TF, Comprehension, MCQ, Gap fill, Word formation, Matching, Error correction, Key word transformation) |
| Vocabulary | `VOCABULARY_MODULE` | Словарный список 15–18 единиц + 7 упражнений, без текста для чтения |
| Перевод (тексты) | `TRANSLATION_TEXTS` | 4–5 жанровых текстов на русском для перевода (аналитика, публицистика, официальный стиль, статистика, непереводимое) |
| Перевод (предложения) | `TRANSLATION_SENTENCES` | 3–4 блока по грамматической теме, 8–12 предложений каждый |
| Глаголы (предложения) | `VERB_SENTENCES` | 20 предложений на русском под конкретный глагол / пару (например `must / have to`); глагол спрашивается отдельным шагом (`WAITING_VERB`) |

**Teacher's Guide** — только для Reading и Vocabulary, и только если на шаге версии выбрано «С ответами для учителя» (`version=teacher`). Генерируется отдельным вызовом Claude (`generateTeacherGuide`), отдаётся вторым PDF.

**Детекция модуля** — `detectModule()` в `lib/module_detect.ts` определяет тип по ключевым словам из свободного запроса (vocabulary/лексика → VOCABULARY_MODULE, перевод/translation + текст → TRANSLATION_TEXTS, глагол → VERB_SENTENCES и т.д.); `extractParams()` вытаскивает уровень/возраст, `extractVerb()` — целевой глагол. Это лишь предустановка визарда — пользователь подтверждает/меняет всё кнопками.

---

## Флоу создания задания (визард)

```
Пользователь пишет запрос (напр. "B2, бизнес, взрослый") — или жмёт «📝 Новое задание» и пишет тему
  → handleRequest: detectModule() + extractParams() (+ extractVerb для VERB_SENTENCES)
  → CLARIFYING, wizard_step=type, last_request сохранён
  → buildWizardMessage("type") — inline-кнопки выбора типа
  → tap wiz_type_* → handleWizardStep: set module_type, editMessageText на следующий шаг
       Reading / Vocabulary → шаг version (без ответов / с ответами для учителя)
       остальные типы       → сразу шаг level
  → tap wiz_ver_*   → set version → шаг level
  → tap wiz_level_* → set level → шаг age
  → tap wiz_age_*   → set ageGroup; дефолты (level=B1, version=student для Reading/Vocab) при пропуске
       VERB_SENTENCES без глагола → WAITING_VERB → "Какой глагол?" → handleVerbInput
       иначе → "Генерирую задание, подожди 10–30 секунд..."
  → generateAndSend → generateModuleContent (Claude); при version=teacher и Reading/Vocab — ещё generateTeacherGuide
  → POST_GENERATION, sendAssignment (splitIfLong) с кнопками: ✏️ Поправить · 📄 Скачать PDF · 🆕 Новое задание
```

На последнем шаге визарда (`age`) генерация запускается немедленно — отдельной кнопки «Генерировать» нет. Тема задания берётся из исходного свободного запроса (`last_request`); если запрос был только командой/кнопкой без темы, темой становится текст, введённый на шаге глагола или сам запрос.

---

## База данных

| Таблица | Назначение |
|---------|-----------|
| `eb_users` | Зарегистрированные пользователи (telegram_id, name, username, invited_by) |
| `eb_sessions` | Текущая сессия пользователя (state + context JSON) |
| `eb_assignments` | Кэш сгенерированных заданий с pgvector embedding (vector 384) |
| `eb_invitations` | Инвайт-коды (code, created_by, used_by, used_at) |
| `folio_login_tokens` | Токены входа в Folio (общая с Folio); бот пишет подтверждение (`confirmed`) при deep-link `folio_login_<token>` |
| `folio_signup_invites` | Signup-инвайты Folio (общая с Folio); бот **читает** при подтверждении инвайт-токена, чтобы разрешить регистрацию нового репетитора |
| `folio_homework_templates` | Библиотека шаблонов Folio (общая с Folio); бот **пишет** (`source='bot'`) сгенерированное задание в воркспейс репетитора при скачивании PDF — мост бот→веб (`resolveFolioWorkspace` + `saveFolioTemplateFromBot`) |

**Кэш**: embedding = `level + topic + ageGroup` через `gte-small` (Supabase AI). Задание попадает в `eb_assignments` при скачивании PDF (пользователь одобрил) и доступно через `/history`. Инфраструктура семантического поиска (`match_assignments` RPC — косинус, порог 0.85, фильтр `module_type`; `findSimilarAssignment`) присутствует, но в текущем визард-флоу **не вызывается** — кэш-оффер «использовать похожее / сгенерировать новое» отключён (мёртвый путь, см. машину состояний и `BACKLOG.md`).

**Мост бот→веб**: при скачивании PDF задание дополнительно зеркалится в `folio_homework_templates` репетитора (`source='bot'`), если Telegram связан с Folio-репетитором (через `folio_auth_methods`). Best-effort: сбой записи в Folio логируется и не ломает выдачу PDF. Воркспейс берётся из верифицированной Telegram-связки, не из тела запроса; аутентичность вебхука — `TELEGRAM_WEBHOOK_SECRET`.

---

## Reply Keyboard (постоянное меню)

```
[📝 Новое задание]  [❓ Справка]
[📋 История]
```

`mainMenu()` в `lib/telegram.ts`. Кнопки дублируют команды: «📝 Новое задание» = `/new`, «❓ Справка» = `/help`, «📋 История» = `/history` (роутятся по тексту в `index.ts`). Показывается после `/start`, `/help`, `/new`, после успешной регистрации.

После `/start` (known/admin) и `/help` дополнительно отправляется сообщение с inline-кнопкой **«🌐 Открыть Folio»** (URL-кнопка на веб-кабинет) — отдельным сообщением, т.к. reply-клавиатура и inline-URL не уживаются в одном.

---

## Секреты Supabase (production)

| Переменная | Назначение |
|------------|-----------|
| `ANTHROPIC_KEY` | Ключ Anthropic API |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота |
| `ADMIN_USER_ID` | Telegram ID администратора |
| `SUPABASE_URL` | URL проекта (auto-injected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ключ Supabase (auto-injected) |
| `FOLIO_WEB_URL` | (опц.) URL веб-кабинета Folio для кнопки «Открыть Folio»; дефолт — прод-URL |
| `TELEGRAM_WEBHOOK_SECRET` | (security) секрет для проверки `X-Telegram-Bot-Api-Secret-Token`; должен совпадать с `secret_token` в setWebhook. Без него вебхук не аутентифицирован (fail-open + warn в логах) |

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

# Зарегистрировать webhook (secret_token ДОЛЖЕН совпадать с TELEGRAM_WEBHOOK_SECRET)
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'

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
