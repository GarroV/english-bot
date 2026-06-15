-- Folio M5: money ledger (charge/payment). Workspace-scoped RLS.
create table folio_student_payments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references folio_workspaces(id) on delete cascade,
  student_id   uuid not null references folio_students(id) on delete cascade,
  amount       numeric(10,2) not null,
  type         text not null check (type in ('charge','payment')),
  lesson_id    uuid references folio_lessons(id) on delete cascade,
  note         text,
  created_by   uuid references folio_users(id),
  created_at   timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index folio_student_payments_ws_student_idx on folio_student_payments (workspace_id, student_id);

alter table folio_student_payments enable row level security;
create policy "workspace_isolation" on folio_student_payments
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (
    workspace_id = folio_current_workspace_id()
    and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id())
  );
