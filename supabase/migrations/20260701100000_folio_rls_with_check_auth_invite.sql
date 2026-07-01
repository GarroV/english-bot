-- Security (#12): folio_auth_methods and folio_invite_tokens had RLS with USING but no WITH CHECK,
-- and no explicit REVOKE of write grants from anon/authenticated — the same privilege-escalation
-- class fixed for folio_users/folio_workspaces in 20260616194059_folio_lock_privesc.sql, but these
-- two tables from folio_init were left untouched. They are written ONLY by the service role
-- (registration RPC, bot bridge, admin client); the request-scoped (authenticated/anon) client must
-- never write them. Mirror the lock-privesc pattern: revoke writes and add WITH CHECK so a row can't
-- be inserted or moved cross-workspace even if a write grant is ever re-added.
revoke insert, update, delete on folio_auth_methods from anon, authenticated;
revoke insert, update, delete on folio_invite_tokens from anon, authenticated;

alter policy "workspace_isolation" on folio_auth_methods with check (
  user_id in (select id from folio_users where workspace_id = folio_current_workspace_id())
);
alter policy "workspace_isolation" on folio_invite_tokens with check (
  workspace_id = folio_current_workspace_id()
);
