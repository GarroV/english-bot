-- Fix #9: lesson status and its money ledger were mutated in two separate awaits (status via
-- setStatus, then charge/reverse in a try/catch that only logged and still returned ok:true), so a
-- charge failure left a "completed" lesson with no charge, and a reverse failure left phantom debt.
-- These RPCs wrap status change + ledger write in ONE transaction (plpgsql = single tx): either both
-- happen or neither. SECURITY INVOKER — every statement runs under the caller's RLS (workspace
-- isolation preserved), and FOR UPDATE serializes concurrent complete/reopen/cancel of one lesson.
-- The charge amount = coalesce(rate_override, default_rate, 0), mirroring chargeAmount() in
-- Folio/src/lib/billing/amount.ts; complete deletes+re-inserts charges so re-completing after a rate
-- change recomputes correctly (the old upsert with ignoreDuplicates silently skipped the recompute).

-- Complete a lesson and (re)create one 'charge' per rostered student from CURRENT rates, atomically.
create or replace function folio_complete_lesson(p_lesson_id uuid)
returns void
language plpgsql
as $$
declare
  v_ws uuid;
begin
  -- RLS restricts this to the caller's workspace; FOR UPDATE locks the row against concurrent changes.
  select workspace_id into v_ws from folio_lessons where id = p_lesson_id for update;
  if v_ws is null then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'completed', updated_at = now() where id = p_lesson_id;

  -- Recompute from scratch: drop existing charges for this lesson, re-insert at current rates.
  delete from folio_student_payments where lesson_id = p_lesson_id and type = 'charge';

  insert into folio_student_payments (workspace_id, student_id, type, amount, lesson_id, created_by)
  select v_ws, ls.student_id, 'charge',
         coalesce(ls.rate_override, s.default_rate, 0),
         p_lesson_id, auth.uid()
  from folio_lesson_students ls
  join folio_students s on s.id = ls.student_id
  where ls.lesson_id = p_lesson_id;
end;
$$;

-- Reopen a completed lesson (back to scheduled) and remove its charges, atomically.
create or replace function folio_reopen_lesson(p_lesson_id uuid)
returns void
language plpgsql
as $$
begin
  perform 1 from folio_lessons where id = p_lesson_id for update;
  if not found then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'scheduled', updated_at = now() where id = p_lesson_id;
  delete from folio_student_payments where lesson_id = p_lesson_id and type = 'charge';
end;
$$;

-- Cancel a lesson and remove its charges (a cancelled lesson is not billed), atomically.
create or replace function folio_cancel_lesson(p_lesson_id uuid)
returns void
language plpgsql
as $$
begin
  perform 1 from folio_lessons where id = p_lesson_id for update;
  if not found then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'cancelled', updated_at = now() where id = p_lesson_id;
  delete from folio_student_payments where lesson_id = p_lesson_id and type = 'charge';
end;
$$;

-- Create a lesson + its roster atomically (was two separate inserts with a fragile cleanup path that
-- could orphan a lesson row with no students if the roster insert AND the cleanup both failed).
create or replace function folio_create_lesson(
  p_type          folio_lesson_type,
  p_scheduled_at  timestamptz,
  p_duration_min  int,
  p_location_type folio_location_type,
  p_notes         text,
  p_student_ids   uuid[]
)
returns uuid
language plpgsql
as $$
declare
  v_ws     uuid;
  v_lesson uuid;
begin
  v_ws := folio_current_workspace_id();
  if v_ws is null then raise exception 'no workspace'; end if;

  insert into folio_lessons (workspace_id, type, scheduled_at, duration_min, location_type, notes)
    values (v_ws, p_type, p_scheduled_at, p_duration_min, p_location_type, p_notes)
    returning id into v_lesson;

  -- RLS WITH CHECK on folio_lesson_students rejects any student_id outside the workspace → rollback.
  insert into folio_lesson_students (lesson_id, student_id)
    select v_lesson, unnest(p_student_ids);

  return v_lesson;
end;
$$;
