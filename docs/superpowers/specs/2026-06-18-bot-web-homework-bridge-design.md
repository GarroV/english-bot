# Bot → Web Homework Bridge (M7) — Design

**Дата:** 2026-06-18
**Веха:** M7 (Homeworks / Bot Bridge), закрывает чекбокс «english-bot пишет в homework_templates».

## Goal

Сделать бота и веб-Folio единым целым на уровне данных: задание, сгенерированное репетитором в Telegram-боте, попадает в его библиотеку шаблонов Folio (`folio_homework_templates`) и становится видимым/назначаемым в вебе.

## Context: почему два хранилища, а не одно

Движок генерации уже общий (`supabase/functions/_shared/generate.ts`) — это единственный источник правды для промптов. Но «готовое» лежит в двух разных таблицах, и это **разные артефакты**, а не дубль:

| | `eb_assignments` (бот) | `folio_homework_templates` (веб) |
|---|---|---|
| Ключ | `telegram_id` | `workspace_id` (NOT NULL) |
| Назначение | семантический кэш (pgvector-эмбеддинги → переиспользование похожих) | назначаемая библиотека репетитора |
| Аудитория | **все** юзеры бота, в т.ч. без Folio-воркспейса | только репетиторы, RLS-изоляция |
| Эмбеддинги | есть (vector 384) | нет |

Слияние в один стор невозможно без потерь: библиотека требует `workspace_id` (у не-Folio-юзеров бота его нет), кэш требует эмбеддинги (которых нет в библиотеке). Полная замена `eb_assignments` = продуктовое решение «standalone-бот растворяется в Folio» + ломает бота для несвязанных юзеров — отвергнуто.

## Decision

**Мост (односторонняя запись бот → веб).** При скачивании PDF бот, помимо записи в свой кэш `eb_assignments`, зеркалит студенческое задание в `folio_homework_templates` воркспейса репетитора с `source='bot'`. Бот работает с service-role-клиентом (RLS обходится), `workspace_id` берётся из верифицированной связки Telegram → `folio_auth_methods` → `folio_users`, не из тела запроса.

## Scope

В этой вехе: **только запись шаблонов бот → веб.**

Не входит (роадмап к полному единству, следующими шагами):
- Обратное чтение библиотеки Folio из бота (бот показывает шаблоны из веба).
- M7c: доставка назначенной домашки ученику (Telegram/email) — блокируется онбордингом ученика.
- M8: кабинет ученика.

## Data flow

1. Репетитор генерит задание в боте → жмёт «Скачать PDF» (`handleDownloadPdf`).
2. PDF отправляется; задание сохраняется в `eb_assignments` (как сейчас).
3. **Новое:** `saveFolioTemplateFromBot()` резолвит воркспейс по `telegram_id` и вставляет строку в `folio_homework_templates` (`source='bot'`).
4. Если запись прошла — короткое подтверждение «📚 Добавлено в библиотеку Folio».

Триггер = скачивание PDF (download = одобрение). Переиспользуем существующую точку, без новых кнопок.

## Resolve workspace

`resolveFolioWorkspace(telegramId)`:
- `folio_auth_methods` (provider='telegram', provider_uid=String(telegramId)) → `user_id` (та же связка, что в `confirmFolioLogin`).
- `folio_users` по id → `workspace_id`, `role`, `archived_at`.
- Возвращает `{ workspaceId, userId }` только для **не архивного** пользователя с ролью ≠ `student`. Иначе `null`.

## Field mapping (бот → folio_homework_templates)

| folio column | источник | примечание |
|---|---|---|
| `workspace_id` | resolveFolioWorkspace | NOT NULL |
| `module_type` | session `module_type` ?? READING_MODULE | энумы совпадают 1:1 (CHECK на 5 типов) |
| `level` | session `params.level` ?? B1 | nullable, без CHECK |
| `age_group` | session `params.ageGroup` ?? adult | nullable, значения совпадают |
| `topic` | `extractTopic(studentText)` | NOT NULL |
| `content` | студенческая версия | NOT NULL |
| `source` | `'bot'` | CHECK in ('web','bot') |
| `created_by` | resolveFolioWorkspace.userId | FK folio_users |

## Defaults / edge cases

1. **Не-репетиторы / несвязанные юзеры:** `resolveFolioWorkspace` → null → запись в Folio молча пропускается. PDF и `eb_assignments` без изменений.
2. **Teacher's Guide:** в схеме один `content` → храним только студенческую версию (как делает веб). Гайд в Folio не зеркалим.
3. **Дедуп:** уникального ключа нет; одна запись на скачивание (паритет с `eb_assignments`).
4. **Изоляция ошибок:** зеркало — в отдельном try/catch ПОСЛЕ отправки PDF и `saveAssignment`. Сбой логируется (`console.error`) и не ломает выдачу PDF.
5. **Пустой контент/тема:** запись пропускается (`content`/`topic` обязательны).

## Security

- `telegram_id` берётся из `query.from.id` (выставляет Telegram, не спуфится юзером).
- `workspace_id` выводится из верифицированной связки, не из пользовательского ввода → юзер не может писать в чужой воркспейс.
- Service-role обходит RLS осознанно; изоляция обеспечивается явным `workspace_id` + гейтом роли.

## Files changed (только бот, без миграций)

- `supabase/functions/english-bot/lib/utils.ts` — `extractTopic()` (чистая, вынесена из inline-кода).
- `supabase/functions/english-bot/lib/db.ts` — `resolveFolioWorkspace()`, `saveFolioTemplateFromBot()`.
- `supabase/functions/english-bot/handlers/pdf_download.ts` — вызов зеркала (best-effort) + подтверждение.
- `supabase/functions/english-bot/lib/utils.test.ts` — unit-тесты `extractTopic`.

## Testing / verification

- Unit: `deno test english-bot/lib/` — `extractTopic`.
- Static: `deno check` / деплой типизирует.
- Data-mapping (прод, Supabase MCP): резолв-запрос для связанного super_admin telegram_id возвращает workspace + роль.
- Insert (прод): контролируемая вставка/удаление строки `source='bot'` подтверждает, что таблица принимает запись бота.
- Деплой: `supabase functions deploy english-bot --no-verify-jwt`.

## Docs

CHANGELOG, BOT.md, README (webhook secret), Folio ROADMAP (M7 чекбокс + имя таблицы), Folio BACKLOG (убрать M7 bot bridge, добавить активацию секрета), Folio/CLAUDE.md (стале `homework_templates`/`template_prompts` → `folio_homework_templates`).

## Addendum — состязательное ревью (2026-06-18)

Прогнан Workflow: 4 ревьюера (authz/tenancy, correctness, regression, data-integrity) × скептик-верификация каждой находки. Итог: **1 CRITICAL подтверждён, 5 отклонено**.

**CRITICAL — аутентичность webhook (вне моста, но обязательна для него).** Исходная security-предпосылка дизайна «`query.from.id` не спуфится» была **неверна как задеплоено**: функция идёт `--no-verify-jwt` и webhook был зарегистрирован без `secret_token`, поэтому `index.ts` не проверял `X-Telegram-Bot-Api-Secret-Token`. Любой мог прислать поддельный update с чужим `from.id`; мост через `resolveFolioWorkspace(from.id)` записал бы в чужой Folio-воркспейс в обход RLS. Сам код моста корректен (workspace_id не из тела), но мост — первый путь, пишущий в чужой тенант по `from.id`, поэтому усиливает пре-существующую дыру.

**Исправление:** `index.ts` сверяет `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET` (constant-time `timingSafeEqual`); fail-closed когда секрет задан, fail-open+warn когда нет. Полная защита включается после активации (перерегистрация webhook с `secret_token` + `supabase secrets set TELEGRAM_WEBHOOK_SECRET`) — требует бот-токен.

**Отклонено (defense-in-depth / не воспроизводится в коде):** сверка `provider_uid`↔`folio_users.telegram_id`; композитный FK `created_by`↔`workspace_id`; «swallow» ошибки `saveAssignment` (пре-существующий, supabase-js не throw'ит на DB-ошибке); trim в `extractTopic` (благоприятный); «без регрессий» (подтверждение). Опциональные хардненинги занесены в Folio BACKLOG.

**Скорректированная модель безопасности:** изоляция тенанта моста = (1) аутентичность webhook через `secret_token` (гарантирует подлинность `from.id`) + (2) `workspace_id` из верифицированной связки, не из ввода + (3) гейт роли/архива в `resolveFolioWorkspace`. Пункт (1) обязателен; до его активации мост работает в fail-open (на проде сейчас один тенант — blast radius минимален, но закрыть до второго репетитора обязательно).
