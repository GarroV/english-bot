-- M8 кабинет ученика: доступ по ссылке-токену + отметка «Я сделал» + комментарий учителя.
-- Всё additive. Новых таблиц нет; статусы folio_homework_assignments уже: assigned→submitted→reviewed.
alter table folio_students add column cabinet_token text unique;              -- персональный токен кабинета (ротируемый)
alter table folio_homework_assignments add column tutor_comment text;         -- комментарий учителя (один на задание)
alter table folio_homework_assignments add column submitted_at timestamptz;   -- когда ученик нажал «Я сделал»
