-- Folio M4: lessons (solo/group) + roster m2m. Workspace-scoped RLS.
create type folio_lesson_type as enum ('solo', 'group');
create type folio_lesson_status as enum ('scheduled', 'completed', 'cancelled');
create type folio_location_type as enum ('online', 'offline');

create table folio_lessons (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references folio_workspaces(id) on delete cascade,
  type           folio_lesson_type not null,
  scheduled_at   timestamptz not null,
  duration_min   int not null default 60,
  status         folio_lesson_status not null default 'scheduled',
  location_type  folio_location_type not null default 'online',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index folio_lessons_ws_time_idx on folio_lessons (workspace_id, scheduled_at);

create table folio_lesson_students (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null references folio_lessons(id) on delete cascade,
  student_id     uuid not null references folio_students(id) on delete cascade,
  rate_override  numeric(10,2),
  amount_charged numeric(10,2),
  created_at     timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index folio_lesson_students_lesson_idx on folio_lesson_students (lesson_id);

alter table folio_lessons enable row level security;
alter table folio_lesson_students enable row level security;

create policy "workspace_isolation" on folio_lessons
  for all
  using (workspace_id = folio_current_workspace_id())
  with check (workspace_id = folio_current_workspace_id());

-- join table scoped through its parent lesson's workspace
create policy "workspace_isolation" on folio_lesson_students
  for all
  using (lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id()))
  with check (lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id()));
