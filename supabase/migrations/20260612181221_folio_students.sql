-- Folio M3: tutor's student roster. Workspace-scoped, RLS via folio_current_workspace_id().
create table folio_students (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references folio_workspaces(id) on delete cascade,
  user_id       uuid references folio_users(id),          -- future linked account; null in M3
  name          text not null,
  email         text,
  telegram_id   bigint,
  default_rate  numeric(10,2),
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index folio_students_workspace_idx on folio_students (workspace_id);

alter table folio_students enable row level security;

-- with check is required so INSERTs are also scoped to the caller's workspace.
create policy "workspace_isolation" on folio_students
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());
