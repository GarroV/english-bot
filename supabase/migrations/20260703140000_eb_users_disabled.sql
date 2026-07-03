-- Мягкий отзыв доступа к боту: null = активен, дата = доступ отозван (обратимо, данные сохраняются).
-- Отключённый пользователь исключается из гейта isAllowed (наличие строки И disabled_at is null).
alter table eb_users add column disabled_at timestamptz;
