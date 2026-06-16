-- Folio M2 fix: atomic tutor provisioning. Consumes the signup invite AND creates the
-- workspace/user/owner/auth-method in ONE transaction, so partial state can never
-- persist and the invite is consumed atomically with creation (strict single-use).
-- Returns the new workspace id, or NULL if the invite is no longer pending (lost the
-- race) — the caller then drops the already-created auth user. Service-role only.
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
     set status = 'used', used_at = now(), used_by = p_auth_user_id
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

  return v_ws_id;
end;
$$;

revoke all on function folio_register_tutor(uuid, uuid, bigint, text, text) from public;
grant execute on function folio_register_tutor(uuid, uuid, bigint, text, text) to service_role;
