# Folio M9 (core) — Super-admin panel (invite & user management)

> Status: approved 2026-06-16. ROADMAP M9.

## Goal

The super-admin issues signup invites and sees who registered, without going through
a developer/SQL. Scoped to invite management + a read-only workspace/tutor list.

## Access control

- Route `/[locale]/admin` (under the authenticated `(app)` group → already auth-gated).
- `getSuperAdmin()` (`lib/admin/guard.ts`): reads the session user's `folio_users.role`
  via the request-scoped client (own row, RLS-allowed). Returns `{ userId }` iff role is
  `super_admin`, else null. Used in the page (redirect to `/dashboard` if null) AND inside
  every server action (never trust the client).
- Cross-workspace reads need the service-role admin client (RLS scopes a tutor to their own
  workspace) — only ever used AFTER `getSuperAdmin()` passes.
- Sidebar shows "Админка" only for super_admin (layout passes `isSuperAdmin` to AppSidebar).

## Server layer — `lib/admin/`

- `guard.ts` — `getSuperAdmin()`.
- `queries.ts` (server-only, NOT "use server"): `listSignupInvites()` (all, newest first,
  with used-by name), `listWorkspacesOverview()` (each workspace: name, owner tutor name +
  telegram, student & lesson counts, created_at). Admin client.
- `actions.ts` (`"use server"`, each gated by `getSuperAdmin()`):
  - `createSignupInvite({ note?, ttlDays? })` → inserts `folio_signup_invites`
    (role 'tutor', created_by = super-admin, ttl clamped 1..90d, default 14), returns `{ token }`.
  - `revokeSignupInvite(id)` → deletes a still-`pending` invite (used ones kept for audit).

## UI

- `/[locale]/admin/page.tsx` (server): `getSuperAdmin()` → redirect `/dashboard` if null;
  load invites + workspaces; render `AdminPanel`.
- `AdminPanel.tsx` (client): create-invite form (note + ttl) → on success shows the full
  link built from `window.location.origin` + `/${locale}/invite/${token}` with a Copy button;
  invites list (link, note, status, expires, used-by, Revoke for pending); workspaces table
  (name, tutor, students, lessons, created).
- `AppSidebar` gains `isSuperAdmin` → conditional "Админка" item; `(app)/layout.tsx` becomes
  async, calls `getSuperAdmin()`, passes the flag.
- i18n: `Admin` namespace + `Nav.admin` (ru+en).

## Security

- Page + every action gated by `getSuperAdmin()`; admin client used only post-gate.
- Invite link assembled client-side (no hardcoded host).
- No destructive tutor/workspace actions in this milestone (defer).

## Verify

tsc / vitest / build; render smoke (super_admin gets /admin 200; a non-super-admin session
is redirected); adversarial review (gating bypass, IDOR, action authz); deploy web.

## Out of scope

Creating/blocking/deleting tutors & workspaces; editing invite after creation; pagination.
