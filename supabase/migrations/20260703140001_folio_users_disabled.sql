-- Мягкое отключение репетитора: null = активен. Отключённый исключается из RLS-резолва воркспейса.
alter table folio_users add column disabled_at timestamptz;

-- RLS-чокпоинт: отключённый пользователь не резолвит воркспейс → все его RLS-запросы пусты
-- (немедленная блокировка активной Folio-сессии). Для активных (disabled_at is null) поведение прежнее.
create or replace function folio_current_workspace_id() returns uuid language sql security definer stable set search_path = public as $$
  select workspace_id from folio_users where id = auth.uid() and disabled_at is null
$$;
