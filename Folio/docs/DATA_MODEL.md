# Folio — Data Model

> Последнее обновление: 2026-06-30
> Статус: таблицы M1–M9 созданы и задеплоены (см. «Применённые миграции»).

---

## Принципы

- Один Supabase-проект с english-bot (`btlglelwxazdxfqdmcti`); таблицы Folio именуются с префиксом `folio_`, чтобы не пересекаться с `eb_*` (english-bot) и схемой Swarm
- Каждая таблица имеет `workspace_id` + RLS (через `folio_current_workspace_id()` — security definer функция, исключающая рекурсию RLS)
- Soft-delete через `archived_at` (не DELETE)
- `created_at` / `updated_at` на всех таблицах
- UUID как PK везде; `folio_users.id` = `auth.users.id` (Supabase Auth)

## Применённые миграции

- `20260608120000_folio_init.sql` — `folio_workspaces`, `folio_users`, `folio_auth_methods`, `folio_invite_tokens` + enums (`folio_user_role`, `folio_language`, `folio_auth_provider`, `folio_invite_role`) + RLS isolation policies + функция `folio_current_workspace_id()`
- `20260612144854_folio_login_tokens.sql` — таблица `folio_login_tokens` (pre-auth токены входа через Telegram) + индекс по `token` + deny-all RLS (только service-role)
- `20260612150019_folio_seed_super_admin.sql` — seed первого super_admin (workspace «Folio», telegram_id 744230399, email v.garro@dodobrands.io) — ВРЕМЕННЫЙ bootstrap
- `20260612181221_folio_students.sql` — таблица `folio_students` (ростер учеников репетитора) + индекс по `workspace_id` + workspace RLS
- `20260612192152_folio_lessons.sql` — таблицы `folio_lessons` + `folio_lesson_students` (M4 Schedule) + enums (`folio_lesson_type`, `folio_lesson_status`, `folio_location_type`) + индексы + RLS (`folio_lessons` workspace-scoped; `folio_lesson_students` — parent-scoped через `folio_lessons`)
- `20260613131140_folio_lesson_students_student_workspace_check.sql` — ужесточение RLS `folio_lesson_students`: `WITH CHECK` дополнительно требует, чтобы `student_id` принадлежал тому же workspace (защита от кросс-workspace ссылок через FK)
- `20260613213941_folio_homework_templates.sql` — таблица `folio_homework_templates` (M7a генерация домашек) + индекс по `workspace_id` + workspace RLS
- `20260615151554_folio_homework_assignments.sql` — таблица `folio_homework_assignments` (M7b назначение шаблона ученику: due_date, status) + индексы + workspace RLS с cross-entity `WITH CHECK`
- `20260615194711_folio_student_payments.sql` — леджер `folio_student_payments` (M5 charge/payment) + индекс + workspace RLS
- `20260616105915_folio_lesson_journal.sql` — таблица `folio_lesson_journal` (M6 журнал урока, одна запись на занятие) + индекс по `workspace_id` + workspace RLS с cross-entity `WITH CHECK` по `lesson_id`
- `20260616142113_folio_signup_invites.sql` — таблица `folio_signup_invites` (M2 self-serve регистрация репетитора) + колонки `signup_invite_id`/`tg_username`/`tg_first_name` в `folio_login_tokens`; service-role only
- `20260616155229_folio_register_tutor_rpc.sql` / `20260616180730_folio_register_tutor_rpc_fix.sql` — функция `folio_register_tutor()`: атомарное создание репетитора (consume инвайта + workspace + user + owner + auth_method в одной транзакции), execute только service_role
- `20260616194059_folio_lock_privesc.sql` — **security**: revoke insert/update/delete на `folio_users` + `folio_workspaces` от anon/authenticated + добавлен `WITH CHECK` в их политики. Закрывает privilege-escalation (репетитор мог PATCH-ом выставить себе `role=super_admin`). Эти таблицы пишет только service-role. См. [[project_folio_rls_invariants]]
- `20260701100000_folio_rls_with_check_auth_invite.sql` — **security (#12)**: тот же lock-privesc паттерн для `folio_auth_methods` + `folio_invite_tokens` (из `folio_init` они были не тронуты): revoke insert/update/delete от anon/authenticated + `WITH CHECK` в их политики. Пишет только service-role.
- `20260701101000_folio_lesson_billing_rpcs.sql` — **#9 атомарность денег**: RPC `folio_complete_lesson` / `folio_reopen_lesson` / `folio_cancel_lesson` / `folio_create_lesson` (все `SECURITY INVOKER`, RLS сохраняется, `FOR UPDATE` сериализует конкурентные смены статуса). Статус занятия и запись/откат леджера `folio_student_payments` — в одной транзакции; complete пересоздаёт charges по текущим ставкам (`coalesce(rate_override, default_rate, 0)`), чинит рассинхрон «урок состоялся без начисления» / «фантомный долг» и пересчёт после смены ставки. Server actions (`lib/lessons/actions.ts`) переведены на эти RPC; `lib/billing/charges.ts` удалён (логика в SQL).

---

## Таблицы

> Таблицы M1 названы с префиксом `folio_` (см. принципы выше) — реальные имена в БД: `folio_workspaces`, `folio_users`, `folio_auth_methods`, `folio_invite_tokens`. Ниже — их актуальная схема (✅ реализовано в `20260608120000_folio_init.sql`).

### folio_workspaces ✅
```sql
id            uuid PK
name          text
owner_id      uuid FK → folio_users.id (nullable, добавлен после создания folio_users — циклическая FK)
created_at    timestamptz
updated_at    timestamptz
```

### folio_users ✅
```sql
id            uuid PK references auth.users(id)  -- совпадает с Supabase Auth user id
workspace_id  uuid FK → folio_workspaces.id
role          folio_user_role enum('super_admin', 'tutor', 'student')
name          text
email         text UNIQUE
telegram_id   bigint UNIQUE nullable
timezone      text DEFAULT 'Europe/Moscow'
language      folio_language enum('ru', 'en') DEFAULT 'ru'
created_at    timestamptz
updated_at    timestamptz
archived_at   timestamptz nullable
```

### folio_auth_methods ✅
```sql
id            uuid PK
user_id       uuid FK → folio_users.id
provider      folio_auth_provider enum('email', 'telegram')
provider_uid  text
created_at    timestamptz
unique(provider, provider_uid)
```

### folio_invite_tokens ✅
```sql
id            uuid PK
workspace_id  uuid FK → folio_workspaces.id
email         text
role          folio_invite_role enum('tutor', 'student')
token         text UNIQUE
expires_at    timestamptz
used_at       timestamptz nullable
created_by    uuid FK → users.id
created_at    timestamptz
```

> ⚠️ **Пока не используется.** Канон инвайтов для участников существующего workspace (инвайт ученика), но этот флоу отложен. Реальный онбординг репетитора идёт через `folio_signup_invites` (создаёт **новый** workspace). RLS этой таблицы — USING-only без `WITH CHECK` (как был баг `folio_users`); при реализации инвайта ученика добавить `WITH CHECK` + `REVOKE` записи от authenticated. См. [BACKLOG.md](BACKLOG.md) (hardening из ревью).

### folio_login_tokens ✅
```sql
id              uuid PK
token           text UNIQUE
status          text CHECK (status IN ('pending','confirmed','consumed')) DEFAULT 'pending'
telegram_id     bigint
folio_user_id   uuid FK → folio_users.id ON DELETE CASCADE
created_at      timestamptz
confirmed_at    timestamptz
consumed_at     timestamptz
expires_at      timestamptz
-- index on (token)
```

> **deny-all RLS** — только service-role (english-bot + серверные роуты Folio); pre-auth таблица; TTL ~5 мин; single-use. RLS включён, но политик НЕТ (любой anon/authenticated доступ запрещён). Жизненный цикл: `pending` (создан страницей `/login`) → `confirmed` (бот поймал `/start folio_login_<token>` и сверил telegram_id) → `consumed` (серверный роут выпустил сессию). M2: добавлены `signup_invite_id` (FK → `folio_signup_invites`), `tg_username`, `tg_first_name` — бот пишет их для регистрации по инвайту. См. [[003-telegram-auth]].

### folio_signup_invites ✅
```sql
id              uuid PK
token           text UNIQUE
role            folio_user_role DEFAULT 'tutor'
note            text
status          text CHECK (status IN ('pending','used')) DEFAULT 'pending'
used_by         uuid FK → folio_users.id ON DELETE SET NULL
created_by      uuid FK → folio_users.id ON DELETE SET NULL
expires_at      timestamptz
created_at      timestamptz
used_at         timestamptz
-- index on (token)
```

> **deny-all RLS** (service-role only), как `folio_login_tokens`. M2 self-serve онбординг репетитора: инвайт создаёт **новый** workspace при погашении (в отличие от `folio_invite_tokens`, добавляющего участника в существующий). Погашение — атомарное, в функции `folio_register_tutor()` (consume инвайта + создание workspace/user/owner/auth_method в одной транзакции → строго one-use, без отката инвайта в pending при сбое). Реализовано в `20260616142113` + RPC `20260616155229`/`20260616180730`. См. [[ARCHITECTURE]].

### folio_students ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE
user_id         uuid FK → folio_users(id) nullable   -- будущая привязка аккаунта ученика; в M3 не используется
name            text not null
email           text nullable
telegram_id     bigint nullable
default_rate    numeric(10,2) nullable               -- ставка за урок по умолчанию (RUB)
notes           text nullable                        -- заметки репетитора
archived_at     timestamptz nullable                 -- soft archive (восстановимо)
created_at      timestamptz
updated_at      timestamptz
-- index on (workspace_id)
```

> Реализовано в `20260612181221_folio_students.sql`. Workspace RLS: политика `workspace_isolation` `FOR ALL` с `USING` **и** `WITH CHECK` по `workspace_id = folio_current_workspace_id()` (WITH CHECK нужен, чтобы INSERT тоже был scoped). Мягкая архивация через `archived_at` (без PII-скраба в M3). `user_id` nullable — задел под будущую привязку аккаунта ученика. См. [[ARCHITECTURE]].

> ⚠️ Старый черновик `### students` (без префикса `folio_`) ниже **устарел** — заменён реализованной таблицей `folio_students ✅` выше. Черновики `lessons` / `lesson_students` (без префикса) **устарели** — заменены реализованными `folio_lessons ✅` / `folio_lesson_students ✅` ниже (M4). Остальные черновики (без префикса) остаются проектными до реализации соответствующих M.

### folio_lessons ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE  -- RLS anchor
type            folio_lesson_type enum('solo', 'group')
scheduled_at    timestamptz
duration_min    int DEFAULT 60
status          folio_lesson_status enum('scheduled','completed','cancelled') DEFAULT 'scheduled'
location_type   folio_location_type enum('online','offline') DEFAULT 'online'
notes           text nullable
created_at      timestamptz
updated_at      timestamptz
-- index on (workspace_id, scheduled_at)
```

> Реализовано в `20260612192152_folio_lessons.sql`. `type` **выводится** из размера ростера (1 ученик → `solo`, 2+ → `group`) — не задаётся вручную. Workspace RLS: политика `workspace_isolation` `FOR ALL` с `USING` **и** `WITH CHECK` по `workspace_id = folio_current_workspace_id()`. Перенос = `UPDATE scheduled_at` (статус остаётся `scheduled`). Отметка «состоялось» только ставит `status='completed'` — хуки биллинга (M5) / журнала (M6) добавятся позже. См. [[ARCHITECTURE]].

### folio_lesson_students ✅
```sql
id              uuid PK
lesson_id       uuid FK → folio_lessons(id) ON DELETE CASCADE
student_id      uuid FK → folio_students(id) ON DELETE CASCADE
rate_override   numeric(10,2) nullable      -- M5: переопределяет default_rate
amount_charged  numeric(10,2) nullable      -- M5: рассчитывается при status=completed
created_at      timestamptz
unique(lesson_id, student_id)
-- index on (lesson_id)
```

> Реализовано в `20260612192152_folio_lessons.sql`. Join-таблица урок ↔ ученик; `unique(lesson_id, student_id)` исключает дубли в ростере. `rate_override` / `amount_charged` — задел под M5 (Billing). RLS `workspace_isolation` `FOR ALL` **через родителя** (у таблицы нет своего `workspace_id`): `lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id())`.

### folio_homework_templates ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE  -- RLS anchor
module_type     text CHECK (module_type IN ('READING_MODULE','VOCABULARY_MODULE','TRANSLATION_TEXTS','TRANSLATION_SENTENCES','VERB_SENTENCES'))
level           text
age_group       text
topic           text not null
content         text not null               -- сгенерированный текст задания
source          text DEFAULT 'web' CHECK (source IN ('web','bot'))
created_by      uuid FK → folio_users(id)
created_at      timestamptz
updated_at      timestamptz
-- index on (workspace_id)
```

> Реализовано в `20260613213941_folio_homework_templates.sql` (M7a). Шаблон сгенерированной домашки. `module_type` ограничен теми же 5 типами, что и движок генерации (`READING_MODULE` / `VOCABULARY_MODULE` / `TRANSLATION_TEXTS` / `TRANSLATION_SENTENCES` / `VERB_SENTENCES`). `source` различает, откуда пришёл шаблон: `'web'` (форма генерации в веб-Folio, дефолт) или `'bot'` (english-bot). Workspace RLS: политика `workspace_isolation` `FOR ALL` с `USING` **и** `WITH CHECK` по `workspace_id = folio_current_workspace_id()`. См. [[ARCHITECTURE]].

### folio_homework_assignments ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE  -- RLS anchor
template_id     uuid not null FK → folio_homework_templates(id) ON DELETE CASCADE
student_id      uuid not null FK → folio_students(id) ON DELETE CASCADE
assigned_by     uuid FK → folio_users(id)
due_date        date
status          text DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','reviewed'))
note            text
assigned_at     timestamptz
created_at      timestamptz
updated_at      timestamptz
-- unique(template_id, student_id); index on (workspace_id, template_id) and (student_id)
```

> Реализовано в `20260615151554_folio_homework_assignments.sql` (M7b). Назначение шаблона ученику (репетитор управляет статусом вручную). Один шаблон назначается ученику не более одного раза (`unique(template_id, student_id)`; повторное назначение — no-op через upsert). Workspace RLS `workspace_isolation` `FOR ALL`: `USING` по `workspace_id`, а `WITH CHECK` дополнительно требует, чтобы `template_id` и `student_id` принадлежали тому же workspace (защита от кросс-workspace ссылок — как у `folio_lesson_students`). Доставка ученику пока ручная (репетитор копирует контент шаблона); авто-доставка — M7c.

### lesson_journal_entries
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
lesson_id       uuid FK → lessons.id
student_id      uuid FK → students.id
topic           text
level           enum('A1','A2','B1','B2','C1','C2')
comment         text nullable
progress_score  int nullable                -- 1-5, субъективная оценка репетитора
created_by      uuid FK → users.id
created_at      timestamptz
```

> ⚠️ Черновик `lesson_journal_entries` выше **устарел** — заменён реализованной `folio_lesson_journal ✅` ниже (M6). В реализации: одна запись на занятие (`unique(lesson_id)`, без `student_id` — история по ученику собирается через ростер), `progress` — свободный текст (не шкала 1–5).

### folio_lesson_journal ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE  -- RLS anchor
lesson_id       uuid not null FK → folio_lessons(id) ON DELETE CASCADE     -- unique: одна запись/занятие
topic           text                                                       -- тема
level           text                                                       -- CEFR A1–C2 (select в UI), nullable
comment         text                                                       -- комментарий: что было
progress        text                                                       -- прогресс: свободный текст
created_by      uuid FK → folio_users(id)
created_at      timestamptz
updated_at      timestamptz
-- unique(lesson_id); index on (workspace_id)
```

> Реализовано в `20260616105915_folio_lesson_journal.sql` (M6). Одна запись на занятие (`upsert` по `lesson_id`). Создаётся вручную кнопкой «Журнал занятия» на состоявшемся занятии (✓ остаётся быстрым и форму не открывает). История по ученику = записи журнала занятий, где ученик был в ростере (`journal → lesson → lesson_students`), поэтому `student_id` в таблице не нужен. RLS `workspace_isolation` `FOR ALL`: `USING` по `workspace_id`, `WITH CHECK` дополнительно требует, чтобы `lesson_id` принадлежал тому же workspace (FK обходит RLS). Заменяет черновик `lesson_journal_entries`. См. [[ARCHITECTURE]].

### folio_student_payments ✅
```sql
id              uuid PK
workspace_id    uuid not null FK → folio_workspaces(id) ON DELETE CASCADE  -- RLS anchor
student_id      uuid not null FK → folio_students(id) ON DELETE CASCADE
amount          numeric(10,2) not null
type            text CHECK (type IN ('charge','payment'))   -- charge=начислено, payment=оплачено
lesson_id       uuid FK → folio_lessons(id) ON DELETE CASCADE nullable  -- set on auto-charges
note            text
created_by      uuid FK → folio_users(id)
created_at      timestamptz
-- unique(lesson_id, student_id); index on (workspace_id, student_id)
```

> Реализовано в `20260615194711_folio_student_payments.sql` (M5). Денежный леджер: остаток ученика = Σ(charge) − Σ(payment). **Charge** создаётся автоматически при отметке занятия «состоялось» (`completeLesson`, сумма = `lesson_students.rate_override ?? folio_students.default_rate ?? 0`, `lesson_id` проставлен) и удаляется при возврате/отмене занятия — инвариант: charge существует ⇔ занятие `completed`. Идемпотентность через `unique(lesson_id, student_id)` (payment'ы имеют `lesson_id=null` и не конфликтуют). **Payment** заносит репетитор вручную. RLS `workspace_isolation` `FOR ALL`: `USING` по `workspace_id`, `WITH CHECK` дополнительно требует student из того же workspace. Реализует черновик `student_payments` из проектной модели. См. [[ARCHITECTURE]].

### homework_templates
> ⚠️ Старый черновик (без префикса `folio_`) — **частично реализован / заменён** таблицей `folio_homework_templates ✅` выше (M7a). В реализации: `module_type` (5 типов движка генерации) вместо `type`/`difficulty`, `source` ∈ (`web`,`bot`), без `bot_cache_key` (кэширование генерации отложено). Черновик ниже оставлен для истории проектных идей.
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
topic           text
level           enum('A1','A2','B1','B2','C1','C2')
type            enum('grammar','vocabulary','reading','writing','mixed')
difficulty      int                         -- 1-5
content         text                        -- сгенерированный текст задания
source          enum('bot','manual')
bot_cache_key   text nullable               -- ключ для кэш-хита в english-bot
created_at      timestamptz
updated_at      timestamptz
```

### homework_assignments
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
template_id     uuid FK → homework_templates.id
student_id      uuid FK → students.id
assigned_by     uuid FK → users.id
assigned_at     timestamptz
due_date        date nullable
status          enum('assigned','submitted','reviewed')
note            text nullable
created_at      timestamptz
updated_at      timestamptz
```

### achievements
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
student_id      uuid FK → students.id
title           text                        -- генерируется OpenAI
emoji           text
description     text
source_type     enum('homework','journal')
source_id       uuid                        -- homework_assignment.id или journal_entry.id
created_at      timestamptz
```

### template_prompts
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
name            text
prompt_text     text
version         int DEFAULT 1
is_active       bool DEFAULT true
created_by      uuid FK → users.id
created_at      timestamptz
updated_at      timestamptz
```

### notifications
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
user_id         uuid FK → users.id
channel         enum('telegram','email')
type            text                        -- 'lesson_reminder', 'homework_assigned', etc
payload         jsonb
status          enum('pending','sent','failed')
sent_at         timestamptz nullable
created_at      timestamptz
```

---

## Вычисляемые данные (Views)

### student_balance_view
```sql
-- Для каждого ученика: сумма charge - сумма payment = остаток
SELECT
  student_id,
  workspace_id,
  SUM(CASE WHEN type = 'charge' THEN amount ELSE -amount END) as balance
FROM student_payments
GROUP BY student_id, workspace_id
```

### workspace_stats_view
```sql
-- Агрегаты для статистики репетитора
-- Количество активных учеников, уроков по месяцам, сумм и т.д.
-- Реализация при разработке модуля Statistics
```

---

## RLS политики (шаблон)

Прямой подзапрос `SELECT workspace_id FROM folio_users WHERE id = auth.uid()` в политике на саму `folio_users` вызывает рекурсию RLS. Поэтому используется `security definer` функция `folio_current_workspace_id()`, которая обходит RLS при чтении `folio_users`:

```sql
create or replace function folio_current_workspace_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select workspace_id from folio_users where id = auth.uid()
$$;

-- Каждая таблица: пользователь видит и пишет только в свой workspace.
-- КАНОН: USING (чтение/видимость) + WITH CHECK (вставка/обновление) — оба обязательны,
-- иначе INSERT не scoped (как был privesc-баг folio_users).
ALTER TABLE folio_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON folio_lessons
  FOR ALL
  USING (workspace_id = folio_current_workspace_id())
  WITH CHECK (workspace_id = folio_current_workspace_id());
```

Функция и базовые политики — в `20260608120000_folio_init.sql`. Все таблицы M3+ следуют шаблону USING + WITH CHECK (у parent-scoped таблиц `WITH CHECK` дополнительно сверяет принадлежность FK тому же workspace). **Исторические исключения:** в init.sql политики были USING-only; `20260616194059_folio_lock_privesc.sql` добавил `WITH CHECK` + `REVOKE` записи (anon/authenticated) на `folio_users`/`folio_workspaces`, но `folio_auth_methods` и `folio_invite_tokens` остаются USING-only — закрыть при реализации инвайта ученика (см. [BACKLOG.md](BACKLOG.md), hardening из ревью).

---

## Статистика после архивации ученика

При `archived_at IS NOT NULL`:
- Персональные данные: `name`, `email`, `telegram_id` → обнуляются или псевдонимизируются
- `student_payments` — сохраняются (суммы для статистики)
- `lesson_journal_entries` — сохраняются (темы для статистики)
- `achievements` — сохраняются
- `homework_assignments` — сохраняются
- `students` запись — остаётся с `archived_at`, без PII
