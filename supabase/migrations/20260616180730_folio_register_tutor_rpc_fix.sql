-- Fix: set used_by only AFTER the folio_users row exists (used_by → folio_users FK,
-- otherwise the consume UPDATE violates the FK because the user is created later in the
-- same tx). The consume still claims the slot atomically (status pending→used) first.
-- Also revoke execute from anon/authenticated (Supabase default-privileges had granted it).
create or replace function folio_register_tutor(
  p_invite_id     uuid,
  p_auth_user_id  uuid,
  p_telegram_id   bigint,
  p_name          text,
  p_email         text
) returns uuid
language plpgsql
as $$
declare
  v_ws_id uuid;
  v_ok    uuid;
begin
  update folio_signup_invites
     set status = 'used', used_at = now()
   where id = p_invite_id and status = 'pending' and expires_at > now()
  returning id into v_ok;
  if v_ok is null then
    return null;  -- invite already used/expired; nothing created (whole tx is a no-op)
  end if;

  insert into folio_workspaces (name) values (p_name) returning id into v_ws_id;
  insert into folio_users (id, workspace_id, role, name, email, telegram_id)
    values (p_auth_user_id, v_ws_id, 'tutor', p_name, p_email, p_telegram_id);
  update folio_workspaces set owner_id = p_auth_user_id where id = v_ws_id;
  insert into folio_auth_methods (user_id, provider, provider_uid)
    values (p_auth_user_id, 'telegram', p_telegram_id::text);
  update folio_signup_invites set used_by = p_auth_user_id where id = p_invite_id;

  return v_ws_id;
end;
$$;

revoke all on function folio_register_tutor(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function folio_register_tutor(uuid, uuid, bigint, text, text) to service_role;
