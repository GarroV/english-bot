-- Секция фидбека (#67): отзывы репетиторов владельцу. Пишется только service-role
-- (Edge Function folio-feedback после секрет-гейта) — RLS включён без политик, как eb_llm_usage.
-- Additive CREATE TABLE — безопасно применять сразу.
create table if not exists folio_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references folio_workspaces(id),
  user_id uuid not null references folio_users(id),
  category text not null check (category in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 1 and 2000)
);
create index if not exists folio_feedback_user_created_idx on folio_feedback (user_id, created_at);
alter table folio_feedback enable row level security;
comment on table folio_feedback is 'Отзывы репетиторов (#67): пишет folio-feedback (service-role), владелец получает копию в Telegram';
