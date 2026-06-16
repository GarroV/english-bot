-- Folio M6: lesson journal. One entry per lesson, workspace-scoped RLS.
create table folio_lesson_journal (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  lesson_id    uuid not null references folio_lessons(id) on delete cascade,
  topic        text,
  level        text,
  comment      text,
  progress     text,
  created_by   uuid references folio_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (lesson_id)
);
create index folio_lesson_journal_ws_idx on folio_lesson_journal (workspace_id);

alter table folio_lesson_journal enable row level security;
create policy "workspace_isolation" on folio_lesson_journal
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (
    workspace_id = folio_current_workspace_id()
    and lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id())
  );
