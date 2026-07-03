-- Folio live-doc Ф3: per-assignment chat thread (both tutor and student post here).
-- One row per message, 1:N under an assignment. Workspace-scoped RLS through the parent assignment
-- (same RLS-through-parent shape as folio_homework_items). The student writes via service-role in a
-- server action scoped by cabinet token; the tutor writes under session (RLS). Author is always set
-- server-side from context ('tutor'|'student'), never trusted from the client. Updated by polling.
create table folio_homework_messages (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references folio_homework_assignments(id) on delete cascade,
  author         text not null check (author in ('student', 'tutor')),
  body           text not null,
  created_at     timestamptz not null default now()
);
create index folio_homework_messages_assignment_created_idx on folio_homework_messages (assignment_id, created_at);

alter table folio_homework_messages enable row level security;

-- Messages are scoped through their parent assignment's workspace (RLS-through-parent).
create policy "workspace_isolation" on folio_homework_messages
  for all
  using (assignment_id in (select id from folio_homework_assignments where workspace_id = folio_current_workspace_id()))
  with check (assignment_id in (select id from folio_homework_assignments where workspace_id = folio_current_workspace_id()));
