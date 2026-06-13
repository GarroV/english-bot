-- Tighten folio_lesson_students RLS: the student must ALSO belong to the caller's
-- workspace, not just the lesson. FK checks bypass RLS, so without this a foreign
-- student_id could be enrolled into one's own lesson. (M4 security review.)
alter policy "workspace_isolation" on folio_lesson_students
  with check (
    lesson_id in (select id from folio_lessons where workspace_id = folio_current_workspace_id())
    and student_id in (select id from folio_students where workspace_id = folio_current_workspace_id())
  );
