-- Деньги v2, follow-up: миграция 20260616194059 отозвала UPDATE на folio_workspaces у
-- authenticated (закрытие privilege-escalation), поэтому запись реквизитов из сессии
-- репетитора невозможна. Возвращаем ровно ОДНУ колонку точечным column-level грантом:
-- политика workspace_isolation (USING + WITH CHECK id = folio_current_workspace_id())
-- по-прежнему ограничивает запись строкой собственного воркспейса, а роль/имя/id
-- остаются недоступными для изменения.
grant update (payment_details) on folio_workspaces to authenticated;
