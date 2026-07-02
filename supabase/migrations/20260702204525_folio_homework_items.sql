-- Folio live-doc Ф1a: itemized homework questions (question + student answer + per-item tutor comment).
-- One row per question, 1:N under an assignment. Workspace-scoped RLS through the parent assignment.
create table folio_homework_items (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references folio_homework_assignments(id) on delete cascade,
  idx            int not null,
  task_label     text,
  question_text  text not null,
  item_type      text not null,
  student_answer text,
  tutor_comment  text,
  updated_at     timestamptz not null default now()
);
create index folio_homework_items_assignment_idx on folio_homework_items (assignment_id, idx);

alter table folio_homework_items enable row level security;

-- Items are scoped through their parent assignment's workspace (RLS-through-parent).
create policy "workspace_isolation" on folio_homework_items
  for all
  using (assignment_id in (select id from folio_homework_assignments where workspace_id = folio_current_workspace_id()))
  with check (assignment_id in (select id from folio_homework_assignments where workspace_id = folio_current_workspace_id()));
