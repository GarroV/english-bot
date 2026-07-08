# English Bot — Архитектура

## Обзор

```
Telegram → webhook → Supabase Edge Function (english-bot) → Anthropic API
                                   ↕
                             Supabase DB (Postgres + pgvector)
```

**Деплой:** `supabase functions deploy english-bot --no-verify-jwt`
**Проект:** `btlglelwxazdxfqdmcti` (**English_bot**, production; аккаунт `vasiliy.garro@gmail.com`, орг `lvfrdaovqwbuakyujbtg`). ⚠️ НЕ путать со вторым проектом того же аккаунта `vbqglndbxkpmreccpqmr` («GarroV's Project»). Полная карта аккаунтов/деплоя — [`ARCHITECTURE.md`](ARCHITECTURE.md).
**Webhook URL:** `https://btlglelwxazdxfqdmcti.supabase.co/functions/v1/english-bot`

---

## Файловая структура

```
supabase/functions/english-bot/
├── index.ts                    — точка входа: проверка webhook secret (X-Telegram-Bot-Api-Secret-Token), парсинг update, роутинг, обработка ошибок (unhandled → ответ пользователю + алерт админу в Telegram)
├── lib/
│   ├── types.ts                — все TypeScript-типы (State, ModuleType, TgUpdate и др.)
│   ├── telegram.ts             — обёртки Telegram API (sendMessage, editMessageText, keyboard, mainMenu)
│   ├── claude.ts               — тонкий ре-экспорт движка генерации из `_shared/generate.ts` (generateModuleContent/generateTeacherGuide/applyEdit + MODEL)
│   ├── config.ts               — конфиг из env: ADMIN_ID (fail-fast при отсутствии/невалидном ADMIN_USER_ID)
│   ├── errors.ts               — friendlyError(): маппинг ошибок LLM в сообщение пользователю; formatAdminAlert(): алерт админу об unhandled-ошибке (user/chat/ввод/ошибка, с усечением)
│   ├── pricing.ts              — usageCostUsd(model, usage): стоимость вызова LLM по токенам (#23 учёт)
│   ├── db.ts                   — Supabase-запросы (сессии, пользователи, задания, инвайты; гейт: isAllowed/isDisabled; отзыв доступа: revokeAccess/restoreAccess; учёт LLM: logLlmUsage, getUsageThisMonth; мост в Folio: resolveFolioWorkspace, saveFolioTemplateFromBot)
│   ├── pdf.ts                  — генерация PDF через pdf-lib (A4, PT Sans regular+bold — полные TTF с кириллицей; строки-заголовки Module:/Task N ·/Teacher's Guide · — жирным, isHeaderLine)
│   ├── utils.ts                — makeFilename, makeTeacherFilename, splitIfLong, generateInviteCode, extractTopic, timingSafeEqual, parseTargetTelegramId
│   ├── module_detect.ts        — detectModule(), extractParams(), extractVerb() из свободного текста пользователя
│   ├── folio_login.ts          — parseLoginPayload(): разбор deep-link `folio_login_<token>` для входа в Folio
│   ├── errors.test.ts          — тесты formatAdminAlert
│   ├── pdf.test.ts             — тесты isHeaderLine
│   ├── utils.test.ts           — тесты utils
│   ├── module_detect.test.ts   — тесты детекции модулей
│   └── folio_login.test.ts     — тесты разбора login-payload
└── handlers/
    ├── start.ts                — /start (регистрация + инвайт-код), /help, /new; на payload `folio_login_` шлёт запрос-подтверждение (кнопки); handleFolioConfirm/handleFolioCancel → confirmFolioLogin (#4)
    ├── request.ts              — WAITING_REQUEST: detectModule/extractParams → CLARIFYING (старт визарда); handleChangeRequest
    ├── clarify.ts              — визард параметров: buildWizardMessage, handleWizardStep (wiz_*); handleVerbInput
    ├── generate.ts             — generateAndSend, sendAssignment, handleNewAssignment
    ├── edit.ts                 — EDITING: применить правки через Claude
    ├── pdf_download.ts         — отправка PDF(ов) + сохранение в кэш eb_assignments + зеркалирование в библиотеку Folio (мост бот→веб)
    ├── history.ts              — /history: список последних 5 заданий + повторное скачивание PDF
    └── admin.ts                — /invite, /users, /usage, /setup, /revoke, /restore (только ADMIN_USER_ID)
```

> **Движок генерации (shared с Folio):** промпты + `generateModuleContent` / `generateTeacherGuide` / `applyEdit` вынесены в `supabase/functions/_shared/generate.ts` (Deno + Anthropic). `lib/claude.ts` — тонкий ре-экспорт из `_shared`. Тот же движок выставлен по HTTP для веб-Folio через Edge Function `folio-generate` — оба потребителя гоняют идентичный код, без дрейфа промптов. Все три функции принимают опциональный `onUsage`-колбэк (токены из ответа Anthropic, awaited до возврата) — бот пишет расход в `eb_llm_usage` (#23); `folio-generate` колбэк пока не передаёт.

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

> **MODULE_LABELS** (человекочитаемые имена типов) — единый источник в `lib/types.ts`, общий для визарда и истории. Путь «кэш-оффер» (состояния `WAITING_TOPIC`/`CACHE_OFFER`, callback'и `use_cached`/`generate_new`, `findSimilarAssignment`) удалён как неиспользуемый. Кэш `eb_assignments` по-прежнему пишется при скачивании PDF (для `/history`), но обратно в диалог не предлагается.

Переходы:

```
/start (новый)        → REGISTERING
/start (admin/known)  → WAITING_REQUEST (+ сообщение с кнопкой «🌐 Открыть Folio»)
/start folio_login_<token> → НЕ подтверждает сразу: шлёт запрос с предупреждением и кнопками
                         «✅ Подтвердить вход» (folio_confirm_<token>) / «❌ Отмена» (folio_cancel_<token>)
                         — защита от login-CSRF (#4). confirmFolioLogin вызывается только по нажатию
                         «Подтвердить» (handleFolioConfirm). Если Telegram не привязан, но токен несёт
                         валидный signup-инвайт — подтверждает для регистрации репетитора
                         (исход invite_expired, если инвайт протух). Отозванный пользователь
                         (eb_users.disabled_at или folio_users.disabled_at) → исход disabled, токен
                         НЕ подтверждается. Иначе обычный путь /start
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

## Гейт доступа и отзыв (revoke)

**Гейт бота.** `index.ts` пропускает обычные сообщения только через `isAllowed(from.id)` — строка в `eb_users` есть **и** `disabled_at IS NULL`. Админ-команды (`/invite`, `/users`, `/usage`, `/setup`, `/revoke`, `/restore`) роутятся ДО гейта и само-гейтятся через `isAdmin` (`ADMIN_USER_ID`).

**Мягкий отзыв доступа (обратимый, данные сохраняются).** Раньше отозвать можно было только неиспользованный инвайт; после регистрации способа не было. Теперь:

> Тот же отзыв доступен и из веб-админки Folio кнопкой «Отозвать/Восстановить доступ» (server action `setTutorAccess`, зеркало этих команд; #76).

- `/revoke <telegram_id>` (admin) → `revokeAccess`: ставит `disabled_at = now()` в **обеих** таблицах — `eb_users` (гейт бота) и, если Telegram связан с Folio (`folio_auth_methods`→`folio_users`), `folio_users` (гейт Folio). Никаких DELETE. Отвечает, что реально отключено (бот / Folio / оба / не найдено).
- `/restore <telegram_id>` (admin) → `restoreAccess`: зеркально снимает `disabled_at` (=null) в обеих таблицах.
- Аргумент разбирается чистой `parseTargetTelegramId` (положительное целое; иначе подсказка формата).
- `/users` помечает отключённых строкой « — 🚫 отключён».

**Каскад блокировки:**
1. **Бот** — `isAllowed` возвращает false для отключённого. Гейт различает «отозван» и «не зарегистрирован»: `isDisabled` (строка есть И `disabled_at` не null) → сообщение «Ваш доступ к боту отозван. Обратитесь к администратору.» вместо общего приглашения.
2. **Новый логин Folio** — `confirmFolioLogin` в начале проверяет `eb_users.disabled_at` и `folio_users.disabled_at`; при любом из них возвращает исход `disabled` и НЕ подтверждает токен.
3. **Активная сессия Folio** — блокируется немедленно через RLS: `folio_current_workspace_id()` теперь `... where id = auth.uid() and disabled_at is null`. Отключённый репетитор не резолвит воркспейс → все RLS-запросы пусты (Folio деградирует чисто: пустые состояния / редирект по `!user`, без падений). JWT не инвалидируется принудительно — RLS-null делает access-token бесполезным для данных воркспейса (полная инвалидация refresh-токенов — в беклоге).

**Реактивация.** Перерегистрация по новому инвайту (`registerUser` с `disabled_at: null` в upsert) также снимает отзыв на стороне бота.

Defense-in-depth: `resolveFolioWorkspace` (мост бот→веб) тоже возвращает null для `disabled_at` (как для `archived_at` / `role='student'`).

---

## Типы модулей

| Тип | Константа | Описание |
|-----|-----------|----------|
| Reading | `READING_MODULE` | Авторский текст + упражнения (TF, Comprehension, MCQ, Gap fill, Word formation, Matching, Error correction, Key word transformation, **Agree or disagree** — мнения персонажей). Для грамматической темы — текст, насыщенный целевой конструкцией, + задание **Grammar practice** (выбор формы) |
| Vocabulary | `VOCABULARY_MODULE` | Словарный список 15–18 единиц + упражнения, без текста для чтения |
| Перевод (тексты) | `TRANSLATION_TEXTS` | 4–5 жанровых текстов на русском для перевода (аналитика, публицистика, официальный стиль, статистика, непереводимое) |
| Перевод (предложения) | `TRANSLATION_SENTENCES` | 3–4 блока; для конкретной грамматической темы (например Past Continuous) КАЖДОЕ предложение требует целевой конструкции, блоки — её разные употребления |
| Глаголы (предложения) | `VERB_SENTENCES` | 20 предложений на русском под конкретный глагол / пару (например `must / have to`); глагол спрашивается отдельным шагом (`WAITING_VERB`) |
| Разогрев | `WARMUP_MODULE` | Короткая **устная** разминка на первые 5–10 минут занятия: Conversation starters (6–8 личных вопросов) + Quick activity (1–2 мини-игры случайно из ротации) + опционально Useful phrases. Без письменных упражнений, одна страница. Тема **опциональна** (без темы — общие вопросы «про жизнь»). Teacher's Guide не генерируется (нет ответов) |

**Уровневый ориентир (CEFR)** — в каждый промпт генерации подставляется описание диапазона `{LEVEL_DESC}` из словаря `LEVEL_GUIDE` (`_shared/generate.ts`): что за лексика, грамматика и длина предложений соответствуют A2/B1/B2/C1/C2. Промпт обязывает соблюдать уровень и в тексте, и в каждом задании (в т.ч. сложность ошибок в Error correction). Введено 2026-07-08 после аудита качества: модель дрейфовала (элементарные ошибки уровня A2 внутри C1-задания).

**Teacher's Guide** — только для Reading и Vocabulary, и только если на шаге версии выбрано «С ответами для учителя» (`version=teacher`). Генерируется отдельным вызовом Claude (`generateTeacherGuide`), отдаётся вторым PDF. Для вопросов на мнение (Discussion, Agree or disagree) и открытых вопросов без ответа в тексте ключ не выдумывается — ставится прочерк с пометкой «вопрос на мнение».

**Детекция модуля** — `detectModule()` в `lib/module_detect.ts` определяет тип по ключевым словам из свободного запроса (разминк/разогрев/warm-up/айсбрейк → WARMUP_MODULE, проверяется первым; vocabulary/лексика → VOCABULARY_MODULE; перевод/translation + текст → TRANSLATION_TEXTS; глагол → VERB_SENTENCES; **названная грамматическая тема** — времена `past/present/future + simple/continuous/perfect`, conditionals, passive voice, reported speech, а также рус. «паст континиус», «кондишнл», «пассивный залог», «косвенная речь» → TRANSLATION_SENTENCES). Голые слова `past`/`future` не триггерят (это частые слова тем: «future of work»). `extractParams()` вытаскивает уровень/возраст, `extractVerb()` — целевой глагол. Это лишь предустановка визарда — пользователь подтверждает/меняет всё кнопками.

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
| `eb_users` | Зарегистрированные пользователи (telegram_id, name, username, invited_by, **disabled_at**). `disabled_at` null = активен; дата = доступ отозван (мягко, обратимо) — исключается из гейта `isAllowed` |
| `eb_sessions` | Текущая сессия пользователя (state + context JSON) |
| `eb_assignments` | Кэш сгенерированных заданий с pgvector embedding (vector 384) |
| `eb_invitations` | Инвайт-коды (code, created_by, used_by, used_at) |
| `eb_llm_usage` | Учёт расхода LLM (#23): source, ref_id, action, model, in/out/cache токены. Пишет service-role (бот); RLS enabled без политик (только service-role). Читалка — `/usage` |
| `folio_login_tokens` | Токены входа в Folio (общая с Folio); бот пишет подтверждение (`confirmed`) при deep-link `folio_login_<token>` |
| `folio_signup_invites` | Signup-инвайты Folio (общая с Folio); бот **читает** при подтверждении инвайт-токена, чтобы разрешить регистрацию нового репетитора |
| `folio_homework_templates` | Библиотека шаблонов Folio (общая с Folio); бот **пишет** (`source='bot'`) сгенерированное задание в воркспейс репетитора при скачивании PDF — мост бот→веб (`resolveFolioWorkspace` + `saveFolioTemplateFromBot`) |

**Кэш/история**: при скачивании PDF задание сохраняется в `eb_assignments` (embedding = `level + topic + ageGroup` через `gte-small`, Supabase AI) и доступно через `/history`. Семантический поиск похожего задания (`match_assignments` RPC + `findSimilarAssignment`) и кэш-оффер удалены как неиспользуемые (миграция `20260702120000_drop_match_assignments`); embedding-колонка пишется, но для поиска сейчас не используется.

**Мост бот→веб**: при скачивании PDF задание дополнительно зеркалится в `folio_homework_templates` репетитора (`source='bot'`), если Telegram связан с Folio-репетитором (через `folio_auth_methods`). Best-effort: сбой записи в Folio логируется и не ломает выдачу PDF. Воркспейс берётся из верифицированной Telegram-связки, не из тела запроса; аутентичность вебхука обязательна (`TELEGRAM_WEBHOOK_SECRET`, fail-closed).

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
| `TELEGRAM_WEBHOOK_SECRET` | (security, **обязателен**) секрет для проверки `X-Telegram-Bot-Api-Secret-Token`; должен совпадать с `secret_token` в setWebhook. **Fail-closed**: без него функция не стартует (бросает на импорте, как `TELEGRAM_BOT_TOKEN`) — задать секрет и перерегистрировать webhook до деплоя |

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
- Embedding может вернуть `null` если Supabase AI недоступен — тогда `eb_assignments.embedding` пишется как `null` (задание всё равно сохраняется; поиск по вектору сейчас не используется)
- После редактирования (`EDITING`) teacher content сбрасывается: кнопка PDF не показывает "студент + учитель"
- Шрифт PT Sans кешируется в памяти инстанса Edge Function (`cachedFontBytes`)
