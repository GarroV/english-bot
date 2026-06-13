-- Folio M7a: generated homework templates (content cache). Workspace-scoped RLS.
create table folio_homework_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  module_type  text not null check (module_type in
    ('READING_MODULE','VOCABULARY_MODULE','TRANSLATION_TEXTS','TRANSLATION_SENTENCES','VERB_SENTENCES')),
  level        text,
  age_group    text,
  topic        text not null,
  content      text not null,
  source       text not null default 'web' check (source in ('web','bot')),
  created_by   uuid references folio_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index folio_homework_templates_ws_idx on folio_homework_templates (workspace_id);
alter table folio_homework_templates enable row level security;
create policy "workspace_isolation" on folio_homework_templates
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());
