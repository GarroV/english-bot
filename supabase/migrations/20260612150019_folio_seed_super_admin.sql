-- Folio M2a: TEMPORARY bootstrap of the first super_admin.
-- Replace with a proper onboarding flow later. Idempotent via fixed UUIDs + ON CONFLICT.

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ws_id   uuid := '00000000-0000-0000-0000-0000000000b1';
  v_email   text := 'v.garro@dodobrands.io';
  v_tg      bigint := 744230399;
begin
  -- 1) auth user (passwordless; email confirmed so magic-link/verifyOtp works).
  -- The token columns MUST be '' not NULL — GoTrue scans them into non-nullable
  -- Go strings and otherwise fails with "Database error finding user".
  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  -- 2) workspace
  insert into folio_workspaces (id, name) values (v_ws_id, 'Folio')
    on conflict (id) do nothing;

  -- 3) folio user (super_admin)
  insert into folio_users (id, workspace_id, role, name, email, telegram_id, language)
    values (v_user_id, v_ws_id, 'super_admin', 'Admin', v_email, v_tg, 'ru')
    on conflict (id) do nothing;

  -- 4) telegram auth method
  insert into folio_auth_methods (user_id, provider, provider_uid)
    values (v_user_id, 'telegram', v_tg::text)
    on conflict (provider, provider_uid) do nothing;

  -- 5) workspace owner
  update folio_workspaces set owner_id = v_user_id where id = v_ws_id and owner_id is null;
end $$;
