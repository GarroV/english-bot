-- Folio live-doc Ф2: iterative tutor review cycle.
-- Status machine widens to assigned → submitted ⇄ returned → accepted.
-- We keep the legacy 'reviewed' value in the CHECK superset so the currently deployed code
-- (which still writes 'reviewed') keeps working during the window between this migration and
-- the app deploy — then migrate every existing 'reviewed' row to the new terminal 'accepted'.
-- Same column, so RLS is unchanged.

-- Drop the existing status CHECK by its (Postgres-default) name; guarded so a re-run is a no-op.
alter table folio_homework_assignments
  drop constraint if exists folio_homework_assignments_status_check;

alter table folio_homework_assignments
  add constraint folio_homework_assignments_status_check
  check (status in ('assigned', 'submitted', 'reviewed', 'returned', 'accepted'));

-- Move completed assignments to the new terminal state (WHERE-scoped — never a blanket update).
update folio_homework_assignments set status = 'accepted' where status = 'reviewed';
