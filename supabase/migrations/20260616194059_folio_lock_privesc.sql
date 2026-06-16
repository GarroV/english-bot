-- Security: close a privilege-escalation hole. folio_users.workspace_isolation had USING
-- but NO WITH CHECK, and `authenticated` holds a default UPDATE grant — so a tutor could
-- PATCH /rest/v1/folio_users?id=eq.<self> {"role":"super_admin"} and unlock the super-admin
-- surface. These tables are written ONLY by the service role (registration RPC, seed,
-- admin client); the request-scoped (authenticated/anon) client must never write them.
-- Verified: no app code INSERT/UPDATE/DELETEs folio_users or folio_workspaces as the user.
revoke insert, update, delete on folio_users from anon, authenticated;
revoke insert, update, delete on folio_workspaces from anon, authenticated;

-- Defense in depth: also constrain the policy so a row can't be written/moved cross-workspace
-- even if a write grant is ever re-added.
alter policy "workspace_isolation" on folio_users with check (workspace_id = folio_current_workspace_id());
alter policy "workspace_isolation" on folio_workspaces with check (id = folio_current_workspace_id());
