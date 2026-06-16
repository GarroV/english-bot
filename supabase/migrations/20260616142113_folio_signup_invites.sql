-- Folio M2: self-serve tutor signup invites (create a NEW workspace on redemption).
-- Distinct from folio_invite_tokens (which adds a member to an existing workspace).
create table folio_signup_invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  role        folio_user_role not null default 'tutor',
  note        text,
  status      text not null default 'pending' check (status in ('pending','used')),
  used_by     uuid references folio_users(id) on delete set null,
  created_by  uuid references folio_users(id) on delete set null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index folio_signup_invites_token_idx on folio_signup_invites (token);

-- Service-role only (bot + Folio server routes); no RLS policies, like folio_login_tokens.
alter table folio_signup_invites enable row level security;

-- Link a login token to a signup invite + carry Telegram display info for registration.
alter table folio_login_tokens
  add column signup_invite_id uuid references folio_signup_invites(id) on delete set null,
  add column tg_username       text,
  add column tg_first_name     text;
