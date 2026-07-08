-- Деньги v2 follow-up: обычная отмена folio_cancel_lesson БЕЗУСЛОВНО удаляла charge занятия,
-- включая начисление за позднюю отмену (note='отмена', его ставит folio_cancel_lesson_with_charge)
-- на уже cancelled-занятии. Повторный клик «Отменить занятие» по перечёркнутой карточке молча
-- стирал деньги (тост «Сохранено»). Сохраняем charge-за-отмену: обычная отмена удаляет только
-- НЕ-отменные charges. reopen/complete по-прежнему чистят всё (там это семантически верно:
-- занятие «расотменяется»/«состоялось»).
create or replace function folio_cancel_lesson(p_lesson_id uuid)
returns void
language plpgsql
as $$
begin
  perform 1 from folio_lessons where id = p_lesson_id for update;
  if not found then raise exception 'lesson not found'; end if;

  update folio_lessons set status = 'cancelled', updated_at = now() where id = p_lesson_id;
  delete from folio_student_payments
    where lesson_id = p_lesson_id and type = 'charge' and coalesce(note, '') <> 'отмена';
end;
$$;
