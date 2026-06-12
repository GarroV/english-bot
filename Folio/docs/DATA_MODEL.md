# Folio — Data Model

> Последнее обновление: 2026-06-08
> Статус: M1 (Фундамент) — таблицы workspaces/users/auth_methods/invite_tokens созданы и задеплоены

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

> **deny-all RLS** — только service-role (english-bot + серверные роуты Folio); pre-auth таблица; TTL ~5 мин; single-use. RLS включён, но политик НЕТ (любой anon/authenticated доступ запрещён). Жизненный цикл: `pending` (создан страницей `/login`) → `confirmed` (бот поймал `/start folio_login_<token>` и сверил telegram_id) → `consumed` (серверный роут выпустил сессию). См. [[003-telegram-auth]].

### students (расширенный профиль ученика)
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
user_id         uuid FK → users.id nullable  -- null если ещё не принял инвайт
name            text
email           text
telegram_id     bigint nullable
default_rate    numeric(10,2)               -- ставка за урок по умолчанию
notes           text nullable               -- заметки репетитора
archived_at     timestamptz nullable
created_at      timestamptz
updated_at      timestamptz
```

### lessons
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
type            enum('solo', 'group')
scheduled_at    timestamptz
duration_min    int DEFAULT 60
status          enum('scheduled', 'completed', 'cancelled', 'rescheduled')
location_type   enum('online', 'offline')
notes           text nullable
created_at      timestamptz
updated_at      timestamptz
```

### lesson_students (many-to-many: урок ↔ ученик)
```sql
id              uuid PK
lesson_id       uuid FK → lessons.id
student_id      uuid FK → students.id
rate_override   numeric(10,2) nullable      -- переопределяет default_rate
amount_charged  numeric(10,2) nullable      -- рассчитывается при status=completed
created_at      timestamptz
```

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

### student_payments
```sql
id              uuid PK
workspace_id    uuid FK → workspaces.id
student_id      uuid FK → students.id
amount          numeric(10,2)
type            enum('charge', 'payment')   -- charge=начислено, payment=оплачено
lesson_id       uuid FK → lessons.id nullable
note            text nullable
created_by      uuid FK → users.id
created_at      timestamptz
```

### homework_templates
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

-- Каждая таблица: пользователь видит только свой workspace
ALTER TABLE folio_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON folio_lessons
  FOR ALL
  USING (workspace_id = folio_current_workspace_id());
```

Эта функция и политики для `folio_workspaces`/`folio_users`/`folio_auth_methods`/`folio_invite_tokens` уже в `20260608120000_folio_init.sql`. Все новые таблицы Folio следуют этому шаблону.

---

## Статистика после архивации ученика

При `archived_at IS NOT NULL`:
- Персональные данные: `name`, `email`, `telegram_id` → обнуляются или псевдонимизируются
- `student_payments` — сохраняются (суммы для статистики)
- `lesson_journal_entries` — сохраняются (темы для статистики)
- `achievements` — сохраняются
- `homework_assignments` — сохраняются
- `students` запись — остаётся с `archived_at`, без PII
