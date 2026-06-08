-- Folio: base schema (M1 — Foundation)
-- Tables are prefixed with folio_ to stay isolated from english-bot's eb_* tables
-- in the same Supabase project (see Folio/docs/002-multitenancy.md).

create type folio_user_role as enum ('super_admin', 'tutor', 'student');
create type folio_language as enum ('ru', 'en');
create type folio_auth_provider as enum ('email', 'telegram');
create type folio_invite_role as enum ('tutor', 'student');

-- Workspaces (tenants). owner_id FK to folio_users is added after that table exists.
create table folio_workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- App-level user profile. id matches auth.users.id (Supabase Auth).
create table folio_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  workspace_id  uuid not null references folio_workspaces(id),
  role          folio_user_role not null,
  name          text not null,
  email         text unique,
  telegram_id   bigint unique,
  timezone      text not null default 'Europe/Moscow',
  language      folio_language not null default 'ru',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

alter table folio_workspaces
  add constraint folio_workspaces_owner_id_fkey
  foreign key (owner_id) references folio_users(id);

-- Linked external auth identities (email / telegram) per user
create table folio_auth_methods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references folio_users(id) on delete cascade,
  provider      folio_auth_provider not null,
  provider_uid  text not null,
  created_at    timestamptz not null default now(),
  unique (provider, provider_uid)
);

-- One-time invite tokens for onboarding tutors/students into a workspace
create table folio_invite_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references folio_workspaces(id),
  email         text not null,
  role          folio_invite_role not null,
  token         text not null unique,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_by    uuid not null references folio_users(id),
  created_at    timestamptz not null default now()
);

-- Returns the workspace_id of the current authenticated user.
-- security definer bypasses RLS on folio_users to avoid recursive policy checks.
create or replace function folio_current_workspace_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from folio_users where id = auth.uid()
$$;

alter table folio_workspaces enable row level security;
alter table folio_users enable row level security;
alter table folio_auth_methods enable row level security;
alter table folio_invite_tokens enable row level security;

create policy "workspace_isolation" on folio_workspaces
  for all
  using (id = folio_current_workspace_id());

create policy "workspace_isolation" on folio_users
  for all
  using (workspace_id = folio_current_workspace_id());

create policy "workspace_isolation" on folio_auth_methods
  for all
  using (
    user_id in (select id from folio_users where workspace_id = folio_current_workspace_id())
  );

create policy "workspace_isolation" on folio_invite_tokens
  for all
  using (workspace_id = folio_current_workspace_id());
