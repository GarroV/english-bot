-- Folio M7b: homework assignments (template -> student). Workspace-scoped RLS.
create table folio_homework_assignments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  template_id  uuid not null references folio_homework_templates(id) on delete cascade,
  student_id   uuid not null references folio_students(id) on delete cascade,
  assigned_by  uuid references folio_users(id),
  due_date     date,
  status       text not null default 'assigned' check (status in ('assigned','submitted','reviewed')),
  note         text,
  assigned_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (template_id, student_id)
);
create index folio_homework_assignments_ws_tpl_idx on folio_homework_assignments (workspace_id, template_id);
create index folio_homework_assignments_student_idx on folio_homework_assignments (student_id);

alter table folio_homework_assignments enable row level security;
create policy "workspace_isolation" on folio_homework_assignments
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (
    workspace_id = folio_current_workspace_id()
    and template_id in (select id from folio_homework_templates where workspace_id = folio_current_workspace_id())
    and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id())
  );
