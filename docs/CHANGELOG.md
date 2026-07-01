# Changelog

Все значимые изменения бота. Формат: `### Тип: Описание`, тип — feat / fix / refactor / chore.

---

## 2026-07-01

### fix: HIGH-кластер бота — fail-closed webhook, тихие сбои Telegram/БД, атомарный инвайт, красный type-check

Закрыт кластер HIGH из аудита 2026-06-30 (Issues #3, #5, #6, #7).

- **#7 (деплой-гейт):** `deno check` снова зелёный. `edit.ts` — ранний возврат при отсутствии активного задания до платного `applyEdit` (снят TS18047 `session possibly null`); `telegram.ts:60` — `new Blob([bytes.slice()])` (снят TS2322 `Uint8Array`→`BlobPart`).
- **#3 (security, fail-closed webhook):** `TELEGRAM_WEBHOOK_SECRET` теперь **обязателен** — `index.ts` бросает на импорте при его отсутствии (как `TELEGRAM_BOT_TOKEN`) и всегда сверяет заголовок. Убрана fail-open ветка, где незаданный секрет делал `from.id` спуфящимся → кросс-воркспейс запись в Folio. **Требует активации до/вместе с деплоем:** секрет не задан в проде — сначала перерегистрировать webhook с `secret_token`, затем `supabase secrets set TELEGRAM_WEBHOOK_SECRET=…`, потом деплой.
- **#5 (тихая потеря заданий):** `call()`/`sendDocument()` в `telegram.ts` проверяют `res.ok`, логируют method/status/description и ловят сетевые сбои. `sendMessage` при Markdown parse-error (`can't parse entities` — рвётся на границе чанка `splitIfLong`) ретраит тот же чанк plain-text'ом, сохраняя клавиатуру — контент больше не теряется молча. Markdown сохранён для меню/справки. Добавлен `telegram.test.ts` (4 теста на ретрай).
- **#6 (обход одноразовости инвайта):** write-функции `db.ts` (`registerUser`/`setSession`/`useInvite`/`saveAssignment`/`createInviteCode`) проверяют `{ error }` и бросают. `useInvite` — атомарный claim (`.is('used_by', null)` + `.select()`), возвращает `boolean`; `start.ts` клеймит код **до** регистрации и отбивает проигравшего гонку — один код больше не регистрирует несколько юзеров (TOCTOU). `saveAssignment` в `pdf_download.ts` обёрнут в best-effort try/catch (PDF уже доставлен — сбой персиста не даёт ложную «ошибку PDF»).

## 2026-06-30

### docs: синхронизация документации с кодом (без изменений кода)

По итогам полного аудита проекта приведены в соответствие доки, описывавшие устаревшую/несуществующую механику. `BOT.md`: state-машина и флоу переписаны под реальный визард (`wiz_*`: тип → [версия] → уровень → возраст, генерация сразу), добавлен 5-й тип `VERB_SENTENCES` и состояние `WAITING_VERB`, исправлена reply-клавиатура (`📝 Новое задание / ❓ Справка / 📋 История`), помечены мёртвые `WAITING_TOPIC`/`CACHE_OFFER`/кэш-оффер, уточнён раздел кэша. `README.md`: команды (+`/history`), 5 типов, секрет `FOLIO_WEB_URL`, упоминание функции `folio-generate`. `BACKLOG.md`: реестр техдолга расширен (мёртвый кэш-оффер, дубль `MODULE_LABELS`, дроп старого `match_assignments`, `deno.json` test-task и др.). Документация Folio (`MASTER_PROJECT.md`, `CLAUDE.md`, `README.md`, ADR-001, `ARCHITECTURE.md`/`DATA_MODEL.md` шапки) приведена к фактическому стеку (Next 16, Anthropic Claude, Cloudflare Workers; OpenAI/n8n/Vercel — не используются) и статусу M1–M9.

## 2026-06-18

### feat: мост бот → веб (M7) — задания из бота попадают в библиотеку Folio

При скачивании PDF бот теперь зеркалит студенческое задание в `folio_homework_templates` воркспейса репетитора (`source='bot'`), так что оно видно и назначается в веб-Folio. Воркспейс резолвится по связке Telegram → `folio_auth_methods` → `folio_users` (`resolveFolioWorkspace` в `lib/db.ts`), запись — `saveFolioTemplateFromBot`, вызов — best-effort после `saveAssignment` в `handlers/pdf_download.ts` (сбой Folio-записи логируется и не ломает выдачу PDF). Для не-репетиторов / несвязанных юзеров — no-op. Извлечение темы вынесено в чистую `extractTopic` (`lib/utils.ts`). Миграций нет — таблица существует с M7a. Движок генерации уже общий — это связывает «готовое» в единый стор назначаемых заданий.

### fix(security): аутентификация webhook — закрытие спуфинга `from.id`

Состязательное ревью моста выявило CRITICAL: вебхук задеплоен `--no-verify-jwt` и был зарегистрирован без `secret_token`, поэтому `query.from.id` (ключ тенанта для моста) спуфился — кто угодно мог прислать поддельный update с чужим `from.id` и записать в чужой Folio-воркспейс в обход RLS (service-role). `index.ts` теперь сверяет заголовок `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET` (constant-time `timingSafeEqual` в `utils.ts`): fail-closed когда секрет задан, fail-open + warn когда нет (чтобы не «окирпичить» бота до настройки). **Активация** (требует бот-токен): перерегистрировать webhook с `secret_token`, затем `supabase secrets set TELEGRAM_WEBHOOK_SECRET=...`.

## 2026-06-17

### fix: модель Anthropic — claude-sonnet-4-6 (генерация была сломана)

`claude-sonnet-4-20250514` ретайрнули — Anthropic API отвечал `404 not_found_error`, из-за чего генерация падала и в боте, и в веб-Folio (`folio-generate` отдавал 500 за ~350мс). Обновил на `claude-sonnet-4-6`; вынес в одну константу `MODEL` в `_shared/generate.ts` (было 3 копии в generateModuleContent / generateTeacherGuide / applyEdit), чтобы больше не дрейфовало. Передеплоены обе функции (`english-bot`, `folio-generate`); проверено реальной генерацией.

### feat: кнопка перехода на сайт Folio

После `/start` (для админа и known-юзеров) и `/help` бот шлёт сообщение с inline-кнопкой «🌐 Открыть Folio» (URL на веб-кабинет). Отдельным сообщением, т.к. персистентная reply-клавиатура (`mainMenu`) и inline-URL-кнопка не уживаются в одном сообщении. URL — константа `FOLIO_URL` в `lib/telegram.ts` (можно переопределить env `FOLIO_WEB_URL`); `InlineKeyboardButton` теперь допускает `url`. Новый хелпер `siteLink()`.

### feat: регистрация репетитора Folio по инвайту через бота

`confirmFolioLogin` (`lib/db.ts`) расширен для self-serve регистрации в Folio (веха M2b). Если Telegram ещё не привязан к Folio-юзеру, но login-токен несёт валидный signup-инвайт — бот подтверждает токен (пишет `telegram_id` + имя/username), не требуя существующего пользователя; провижининг репетитора и воркспейса делает веб (`/api/auth/telegram/session`). Добавлен отдельный исход `invite_expired` с понятным сообщением («Приглашение истекло или уже использовано»). Обычный вход существующих пользователей и `not_linked` для незнакомцев без инвайта — без изменений.

## 2026-06-13

### refactor: движок генерации в _shared

Код генерации (промпты + `generateModuleContent` / `generateTeacherGuide` / `applyEdit`) вынесен из `lib/claude.ts` в `supabase/functions/_shared/generate.ts`. Теперь `lib/claude.ts` — тонкий ре-экспорт из `_shared`; поведение бота не изменилось, бот передеплоен. Новая Edge Function `folio-generate` выставляет тот же движок по HTTP для веб-Folio — оба потребителя гоняют идентичный движок, без дрейфа промптов.

---

## 2026-06-12

### fix: роутинг `/start` с payload

`index.ts` матчил команду строго `text === "/start"`, поэтому deep-link `/start folio_login_<token>` не доходил до `handleStart` и логин Folio молча не срабатывал. Теперь роутер принимает и `text.startsWith("/start ")`. Симптом: бот отвечал обычным приветствием, токен в `folio_login_tokens` оставался `pending`.

### feat: Bot Bridge — подтверждение входа в Folio

`/start` теперь обрабатывает deep-link `folio_login_<token>`: бот разбирает payload (новый `lib/folio_login.ts`, функция `parseLoginPayload`) и подтверждает токен веб-логина Folio через новую `confirmFolioLogin` в `lib/db.ts`. Токен сверяется с `telegram_id` отправителя (юзер резолвится через `folio_auth_methods`) и помечается `confirmed` в таблице `folio_login_tokens`. Обычное поведение `/start` (регистрация по инвайт-коду / приветствие) не меняется, если в payload нет `folio_login_`.

---

## 2026-06-06

### feat: история заданий (/history)

Новая команда `/history` и кнопка "📋 История" в главном меню. Показывает последние 5 заданий пользователя из `eb_assignments` с типом, уровнем и датой. К каждому — кнопка "📄 PDF #N" для повторного скачивания. Добавлена функция `getUserAssignments` в `db.ts` и хендлер `handlers/history.ts`.

---

## 2026-05-25

### refactor: сохранение задания только при скачивании PDF

Раньше `saveAssignment` вызывался сразу после генерации. Теперь — только в `handlers/pdf_download.ts`, при нажатии "Скачать PDF". Логика: пользователь одобрил задание фактом скачивания, только тогда оно попадает в кэш.

### feat: фильтр кэша по типу модуля

`findSimilarAssignment` теперь принимает `moduleType` и фильтрует результаты. Задания Reading больше не предлагаются для Vocabulary-запросов. Реализовано через новую RPC `match_assignments` с параметром `filter_module_type` (миграция `20260525000001`).

### feat: все типы модулей сохраняются в БД

Поле `module_type` заполняется для всех 4 типов при сохранении. До этого сохранялись только Reading/Vocabulary.

### feat: reply keyboard (постоянное меню)

Добавлены кнопки `▶️ Старт`, `❓ Справка`, `📝 Сформировать задание` в нижней части экрана. Показываются после `/start`, `/help`, `/new`, регистрации инвайтом. Кнопка "Сформировать задание" открывает экран параметров напрямую без ввода текста.

### feat: выбор типа модуля прямо в экране уточнений

В `buildClarifyMessage` добавлен ряд кнопок с типами модулей — можно сменить тип прямо на экране параметров без повторного ввода запроса.

### fix: поддержка кириллицы в PDF

Шрифт PT Sans (TTF, поддержка Latin + Cyrillic) загружается с Google Fonts и кэшируется в памяти инстанса. До этого кириллица не отображалась в PDF.

### chore: добавлен аватар бота

Файл `avatar.png` добавлен в репозиторий.

---

## 2026-05-15

### feat: команды /help и /new

`/help` — справка по типам заданий и примеры запросов.
`/new` — быстрый сброс в `WAITING_REQUEST` без `/start`.

### feat: /setup для регистрации меню команд Telegram

`/setup` (только admin) — вызывает `setMyCommands` и регистрирует `/start`, `/new`, `/help` в боковом меню Telegram.

### feat: clarify handler — экран параметров с inline keyboard

Полный экран выбора параметров задания: тип модуля (2×2), уровень (A2–C2), возраст, версия (студент/учитель). Текущие выборы отмечены `✓`. Кнопка "✅ Генерировать" всегда доступна, применяет дефолты для незаполненных параметров.

### feat: module detection из свободного запроса

`detectModule()` в `lib/module_detect.ts` определяет тип задания по ключевым словам (vocabulary/лексика, перевод/translation, sentences/предложения). `extractParams()` извлекает уровень (A2/B1/B2/C1/C2) и возрастную группу.

### feat: промпты для всех 4 типов модулей

Отдельные промпты в `lib/claude.ts`: `READING_PROMPT`, `VOCABULARY_PROMPT`, `TRANSLATION_TEXTS_PROMPT`, `TRANSLATION_SENTENCES_PROMPT`. Плюс `TEACHER_GUIDE_PROMPT` для версии с ответами.

### feat: Teacher's Guide

Для Reading и Vocabulary при выборе версии "с ответами" генерируется отдельный документ через `generateTeacherGuide`. PDF-скачивание отдаёт два файла: студенческий и учительский (`*_teacher.pdf`).

### feat: типы модулей в БД

Добавлена колонка `module_type` в `eb_assignments` (миграция `20260515000001`). `saveAssignment` сохраняет тип при записи.

### fix: дефолт version только для контентных модулей

`params.version` не устанавливается по умолчанию для Translation-модулей — у них нет версии с ответами.

---

## 2026-05-13

### feat: полный рефакторинг на Deno + Supabase Edge Function

Бот переписан с Python на TypeScript/Deno и задеплоен как Supabase Edge Function. Ключевые изменения:

- **Роутер** `index.ts` — разбор Telegram update, диспетчеризация по обработчикам
- **Слой DB** `lib/db.ts` — все запросы к Supabase через `@supabase/supabase-js`
- **Semantic cache** — pgvector (vector 384, gte-small), косинусное сходство ≥ 0.85
- **PDF-генератор** `lib/pdf.ts` — pdf-lib, A4, PT Sans
- **Инвайт-система** — одноразовые коды, `eb_invitations`, admin-команда `/invite`
- **Машина состояний** — 7 состояний сессии в `eb_sessions` (JSONB context)
- **Редактирование** — `handlers/edit.ts`, Claude применяет точечные правки
- **Дружелюбные ошибки** — rate limit, credit balance, auth — понятные сообщения на русском
- **Тесты** — `utils.test.ts`, `module_detect.test.ts`

### chore: удалён старый Python-бот

Старый `bot.py` и зависимости удалены из репозитория.

### fix: embedding fault-tolerant

`embed()` возвращает `null` при ошибке AI-сессии, генерация продолжается без кэша.

---

## Диагностика и инциденты

### 2026-05-25 — бот не отвечал после пополнения баланса Anthropic

**Причина:** секрет `ANTHROPIC_KEY` не был задан в Supabase (в продакшене был только `OPENAI_API_KEY` от старой версии). `lib/claude.ts:4` читает `Deno.env.get("ANTHROPIC_KEY")` — получал `undefined`, SDK падал при инициализации.

**Решение:**
```bash
supabase secrets set ANTHROPIC_KEY=<ключ>
supabase functions deploy english-bot --no-verify-jwt
```
