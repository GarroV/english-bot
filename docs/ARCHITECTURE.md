# Архитектура — English Bot + Folio (монорепо)

> **Единый источник правды по системе:** что это, где что хранится, как деплоить, и на чём НЕ проколоться. Инфраструктуру/аккаунты/деплой держим ТОЛЬКО здесь — остальные доки ссылаются сюда. Факты сверены с CLI (`supabase projects list` / `wrangler whoami` / bot `getMe`) 2026-07-02.

---

## 1. Что это

Монорепо `GarroV/english-bot` — два связанных продукта:

- **English Bot** — Telegram-бот генерации учебных заданий по английскому. Deno / Supabase Edge Function. Детали: [`BOT.md`](BOT.md).
- **Folio** — веб-приложение для репетиторов (ученики, расписание, домашки, деньги, кабинет ученика). Next.js 16 → Cloudflare Workers (OpenNext). Детали: [`../Folio/docs/ARCHITECTURE.md`](../Folio/docs/ARCHITECTURE.md).

Оба делят **один Supabase-проект** и **общий LLM-движок** `supabase/functions/_shared/generate.ts` (модель `claude-sonnet-4-6`, вызывается ботом напрямую и вебом по HTTP через `folio-generate`).

---

## 2. ⚠️ Инфраструктура и аккаунты — ГЛАВНОЕ, чтобы не перепутать

Всё на **ЛИЧНОМ** Google-аккаунте `vasiliy.garro@gmail.com`. Это **не** рабочий dodobrands: `v.garro@dodobrands.io` встречается только как email супер-админа **в данных** Folio (seed-миграция), а не как аккаунт хостинга/БД.

| Что | Где | Идентификатор |
|-----|-----|---------------|
| Код | GitHub | `GarroV/english-bot` (бот + Folio в одном репо) |
| БД + Edge Functions | **Supabase**, проект **English_bot** | ref `btlglelwxazdxfqdmcti` · орг `lvfrdaovqwbuakyujbtg` · регион `eu-central-1` · аккаунт `vasiliy.garro@gmail.com` |
| Веб-Folio | **Cloudflare Workers** (OpenNext) | воркер `folio` → `folio.vasiliy-garro.workers.dev` · аккаунт `vasiliy.garro@gmail.com` (id `ea112105dc90594bac815e2e277aedea`) |
| Telegram-бот | Telegram Bot API | `@garro_oracle_bot` (id `8080425387`) |

### ⚠️⚠️ Проект-двойник в Supabase
В **том же** Supabase-аккаунте лежит ВТОРОЙ проект `vbqglndbxkpmreccpqmr` («GarroV's Project») — он **к English_bot/Folio НЕ относится**. Все команды и URL — только `btlglelwxazdxfqdmcti`. **Никогда** не деплой/мигрируй в `vbqglndbxkpmreccpqmr`.

---

## 3. Что деплоится и как

Креды — в **gitignored корневом `.env`**: `SUPABASE_ACCESS_TOKEN` (PAT для Management API), `TELEGRAM_BOT_TOKEN` (для setWebhook). `wrangler` уже залогинен под gmail-аккаунт. Перед деплоем: `source .env`.

| Компонент | Команда |
|---|---|
| Бот | `supabase functions deploy english-bot --no-verify-jwt --project-ref btlglelwxazdxfqdmcti` |
| Движок для веба | `supabase functions deploy folio-generate --no-verify-jwt --project-ref btlglelwxazdxfqdmcti` |
| PDF ученика | `supabase functions deploy folio-homework-pdf --no-verify-jwt --project-ref btlglelwxazdxfqdmcti` |
| Веб-Folio | из `Folio/`: `npm run cf:deploy` (OpenNext → Cloudflare) |
| Миграции | `POST https://api.supabase.com/v1/projects/btlglelwxazdxfqdmcti/database/query` (заголовок `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`) + `insert` записи в `supabase_migrations.schema_migrations` |

`--no-verify-jwt` обязателен: Telegram (webhook) и веб шлют запросы без JWT.

---

## 4. ✅ Чек-лист перед деплоем/миграцией (чтобы не объебаться)

- [ ] **`--project-ref btlglelwxazdxfqdmcti` в КАЖДОЙ команде** — не двойник `vbqglndbxkpmreccpqmr`, не другой аккаунт.
- [ ] Ветка от свежего `main`. **В `main` не коммитить напрямую** — PR → CI зелёный → merge.
- [ ] Type-check зелёный: `deno check` затронутого (бот) / `npx tsc --noEmit` (Folio).
- [ ] Тесты зелёные: `deno test supabase/functions/english-bot/lib/ --allow-env` / `npm test` (Folio).
- [ ] Миграция: `ADD COLUMN`/`CREATE TABLE` — можно сразу; `DROP`/`RENAME`/`ALTER COLUMN` — **в два шага** (убрать из кода + деплой → потом схема). **Никогда** `DELETE`/`UPDATE` без `WHERE`.
- [ ] Новая таблица Folio → **RLS в той же миграции** (workspace-изоляция).
- [ ] Секреты — только в `.env` (gitignored) / Supabase secrets. Не в коде.
- [ ] Тронул общий движок `_shared/generate.ts` → **передеплой всех потребителей**: `english-bot`, `folio-generate`, `folio-homework-pdf`.
- [ ] После деплоя — **смоук реального флоу** (эндпоинт/экран), не «по коду должно работать».
- [ ] `gh run watch` может показать СТАРЫЙ ран — сверяй CI именно на HEAD (`gh pr checks <PR>`).
- [ ] Доки обновлены в том же изменении (эта страница + инвентари в `BOT.md`/`DATA_MODEL.md`).

---

## 5. Поверхности (surfaces)

| Поверхность | Технология | Что делает | Код |
|---|---|---|---|
| Telegram-бот | Deno Edge Function `english-bot` | генерация заданий, PDF, история, инвайты, `/usage` | `supabase/functions/english-bot/` |
| Движок генерации по HTTP | Edge Function `folio-generate` | `generate`/`edit`/`itemize` для веба (secret-authed) | `supabase/functions/folio-generate/` |
| PDF ученика | Edge Function `folio-homework-pdf` | PDF по токену (кабинет) + content→PDF (репетитор) | `supabase/functions/folio-homework-pdf/` |
| Веб-Folio | Next.js 16 / CF Workers | дашборд, расписание, ученики, домашки, деньги, админка | `Folio/src/app/[locale]/(app)/` |
| Кабинет ученика | Next.js, доступ по токену (без логина) | ДЗ (структурные ответы), расписание, PDF | `Folio/src/app/[locale]/s/[token]/` |
| Логин/инвайт | Next.js + Telegram | вход через `@garro_oracle_bot` (nonce) | `Folio/src/app/[locale]/login/`, `.../invite/` |

Команды бота и таблицы БД — инвентарь в [`BOT.md`](BOT.md); модель данных Folio — [`../Folio/docs/DATA_MODEL.md`](../Folio/docs/DATA_MODEL.md).

---

## 6. Секреты (где что хранится)

- **Supabase secrets** (для Edge Functions): `ANTHROPIC_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_USER_ID`, `TELEGRAM_WEBHOOK_SECRET` (обязателен, fail-closed), `FOLIO_GENERATE_SECRET`, `FOLIO_WEB_URL` (опц.); `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — auto-injected.
- **Cloudflare Worker env (Folio)**: `FOLIO_GENERATE_URL` + `FOLIO_GENERATE_SECRET` (вызов движка), `SUPABASE_SECRET_KEY` (service-role для admin-клиента), `NEXT_PUBLIC_SUPABASE_URL` и прочие `NEXT_PUBLIC_*`.
- **Корневой `.env`** (локально, gitignored, для деплоя/миграций): `SUPABASE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`.

Полный актуальный список — в Supabase dashboard (secrets) и `wrangler` (vars/secrets); в коде секретов нет.

---

## 7. Грабли (на чём уже прокалывались)

- **Проект-двойник** `vbqglndbxkpmreccpqmr` (см. §2) — главный источник путаницы.
- **`TELEGRAM_WEBHOOK_SECRET`** обязателен: `index.ts` бросает на старте без него; `secret_token` в setWebhook должен совпадать (иначе `from.id` спуфится → кросс-воркспейс запись).
- **Folio middleware — `middleware.ts` (Edge)**, НЕ `proxy.ts` (в Next 16 только Node, несовместим с Cloudflare Workers).
- **LLM-модель — `claude-sonnet-4-6`** (одна константа `MODEL`); старый `claude-sonnet-4-20250514` ретайрнут (404 → ломал генерацию).
- **Общий движок бандлится в 3 функции** — правка `_shared/generate.ts` требует передеплоя всех трёх.
- **`ADMIN_USER_ID`** резолвится fail-fast (`lib/config.ts`): при пустом значении бот не стартует (раньше NaN тихо запирал admin).
- **OpenAI/n8n/Vercel/Railway в проекте НЕ используются** — если встретишь в старых доках/черновиках, это отменённые ранние идеи (LLM = Anthropic; хостинг веба = Cloudflare; события — best-effort в server actions).

---

## 8. Что где документировано

| Тема | Файл |
|---|---|
| Бот: state machine, флоу, таблицы `eb_*`, команды, секреты | [`BOT.md`](BOT.md) |
| Folio: архитектура веба, auth, hosting | [`../Folio/docs/ARCHITECTURE.md`](../Folio/docs/ARCHITECTURE.md) |
| Folio: модель данных `folio_*` | [`../Folio/docs/DATA_MODEL.md`](../Folio/docs/DATA_MODEL.md) |
| Обзор Folio + вехи | [`../Folio/docs/MASTER_PROJECT.md`](../Folio/docs/MASTER_PROJECT.md), [`../Folio/docs/ROADMAP.md`](../Folio/docs/ROADMAP.md) |
| История изменений | [`CHANGELOG.md`](CHANGELOG.md) |
| Беклог/техдолг | [`BACKLOG.md`](BACKLOG.md) (канон беклога — GitHub Issues) |
| Архитектурные решения | `../Folio/docs/00*.md` (ADR — исторические снимки) |
