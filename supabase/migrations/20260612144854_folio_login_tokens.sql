-- Folio M2a: one-time Telegram login tokens.
-- Pre-auth table: written by english-bot (service role) and Folio server routes only.
-- RLS is enabled with NO policy => deny-all for anon/authenticated; service role bypasses RLS.

create table folio_login_tokens (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique,
  status         text not null default 'pending' check (status in ('pending','confirmed','consumed')),
  telegram_id    bigint,
  folio_user_id  uuid references folio_users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  consumed_at    timestamptz,
  expires_at     timestamptz not null
);

create index folio_login_tokens_token_idx on folio_login_tokens (token);

alter table folio_login_tokens enable row level security;
-- No policies on purpose: only service-role (bot + Folio server routes) may touch this table.
