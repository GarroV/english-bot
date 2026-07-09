-- Инлайн-ответы в тексте задания (#56): ученик пишет прямо в пропусках (_____) контента.
-- Формат: {"<порядковый номер пропуска>": "текст", "free": "свободный ответ без пропусков"}.
-- Additive ADD COLUMN — безопасно применять сразу.
alter table folio_homework_assignments add column if not exists inline_answers jsonb;
comment on column folio_homework_assignments.inline_answers is 'Ответы ученика в пропусках текста задания (#56); ключ = номер пропуска или "free"';
