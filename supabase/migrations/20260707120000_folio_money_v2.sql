-- Деньги v2 (спека 2026-07-07):
-- 1) Реквизиты для кнопки «Напомнить об оплате» — простое текстовое поле воркспейса.
-- 2) Поздняя отмена с начислением: отмена занятия + charge за отмену в ОДНОЙ транзакции.
--    Ослабляет инвариант «charge ⇔ completed»: charge может висеть на cancelled-занятии,
--    UI отличает его по статусу занятия (join), отдельного типа не нужно.

alter table folio_workspaces add column if not exists payment_details text;

-- Отмена занятия с начислением доли ставки (0 < p_fraction <= 1) каждому ученику ростера.
-- SECURITY INVOKER: все statements под RLS вызывающего (изоляция воркспейса сохраняется).
create or replace function folio_cancel_lesson_with_charge(p_lesson_id uuid, p_fraction numeric)
returns void
language plpgsql
as $$
declare
  v_ws uuid;
begin
  if p_fraction is null or p_fraction <= 0 or p_fraction > 1 then
    raise exception 'fraction must be in (0, 1]';
  end if;

  select workspace_id into v_ws from folio_lessons where id = p_lesson_id for update;
  if v_ws is null then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'cancelled', updated_at = now() where id = p_lesson_id;

  -- Пересоздаём charge этого занятия как «за отмену» (доля текущей ставки).
  delete from folio_student_payments where lesson_id = p_lesson_id and type = 'charge';
  insert into folio_student_payments (workspace_id, student_id, type, amount, lesson_id, note, created_by)
  select v_ws, ls.student_id, 'charge',
         round(coalesce(ls.rate_override, s.default_rate, 0) * p_fraction, 2),
         p_lesson_id, 'отмена', auth.uid()
  from folio_lesson_students ls
  join folio_students s on s.id = ls.student_id
  where ls.lesson_id = p_lesson_id;
end;
$$;
