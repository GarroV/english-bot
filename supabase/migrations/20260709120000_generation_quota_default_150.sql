-- Стандартный месячный лимит генераций = 150 (#75, решение владельца 2026-07-09).
-- Новые воркспейсы получают 150 по умолчанию; действующим репетиторам выставляется 150,
-- воркспейсы супер-админа остаются безлимитными (NULL). UPDATE строго с WHERE.
alter table folio_workspaces alter column generation_quota set default 150;

update folio_workspaces
set generation_quota = 150
where generation_quota is null
  and owner_id not in (select id from folio_users where role = 'super_admin');
