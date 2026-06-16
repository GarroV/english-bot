# Folio M2 — Self-serve tutor registration via invite (+ demo data)

> Status: approved 2026-06-16. Extends ROADMAP M2.

## Goal

A customer (a new tutor) opens an invite link, logs in with their Telegram, and lands
in a freshly-created, demo-seeded workspace of their own — without manual provisioning.

## Existing primitives (confirmed)

- `folio_users.id == auth.users.id` (FK). `folio_current_workspace_id()` = `workspace_id`
  of `folio_users where id = auth.uid()`. Telegram link = `folio_auth_methods(provider='telegram', provider_uid)`.
- Login: web creates `folio_login_tokens` (pending) → bot `/start folio_login_<token>`
  → `confirmFolioLogin` resolves Telegram → `folio_user`, sets confirmed → web `/api/auth/telegram/session`
  consumes token → `mintSessionForUser(email)` (admin `generateLink` magiclink → `verifyOtp`).
- `folio_invite_tokens` is workspace-scoped (existing-workspace member invites) — NOT used here.

## Data

- **New `folio_signup_invites`** (service-role only, no RLS policies — like `folio_login_tokens`):
  `id, token unique, role folio_user_role default 'tutor', note text, status text check in (pending,used) default 'pending', used_by uuid → folio_users, created_by uuid → folio_users null, expires_at timestamptz, created_at, used_at`.
- **ALTER `folio_login_tokens`** add: `signup_invite_id uuid → folio_signup_invites`, `tg_username text`, `tg_first_name text`.

## Flow

1. **Issue invite** (now: a script; later: M9 admin UI). Inserts a `folio_signup_invites`
   row, prints `https://<host>/ru/invite/<token>`.
2. **Invite page** `/[locale]/invite/[token]` (PUBLIC — added to middleware). Server validates
   the invite (pending + not expired). Client: "Войти через Telegram" → POST `/api/auth/telegram/start`
   with `inviteToken` → creates a login token carrying `signup_invite_id` → shows bot deep-link
   + polls `/api/auth/telegram/status`.
3. **Bot** `confirmFolioLogin(token, telegramId, firstName, username)`:
   - token pending + unexpired required.
   - Telegram already linked (`folio_auth_methods`) → confirm with `folio_user_id` (normal login).
   - Not linked + token has `signup_invite_id` (invite still pending+unexpired) → record
     `telegram_id/tg_first_name/tg_username`, status=confirmed, `folio_user_id` stays null.
   - Not linked + no invite → `not_linked` (unchanged).
4. **Web `/api/auth/telegram/session`** consuming a confirmed token:
   - has `folio_user_id` → mint (existing behavior).
   - else has `signup_invite_id` + `telegram_id` → `registerTutorFromInvite` then mint.

## Provisioning — `lib/auth/register.ts` `registerTutorFromInvite({inviteId, telegramId, name})`

Admin client. Order with cleanup on partial failure:
1. Atomically consume the invite: `update folio_signup_invites set status='used', used_at=now() where id=? and status='pending' returning id` — 0 rows ⇒ abort (race/reused).
2. If `telegram_id` already in `folio_auth_methods` ⇒ that user exists; skip creation, return their email (defensive — bot should have caught it).
3. Create `auth.users` (synthetic email `tg<telegramId>@folio.local`, `email_confirmed_at=now()`, all token columns `''` — the GoTrue empty-string fix) → `authUserId`.
4. `folio_workspaces` (name = `name`'s workspace).
5. `folio_users` (`id=authUserId`, workspace_id, role='tutor', name, email synthetic, telegram_id).
6. `folio_workspaces.owner_id = authUserId`.
7. `folio_auth_methods` (telegram, provider_uid=telegramId, user_id=authUserId).
8. `seedDemoWorkspace(workspaceId)`.
9. Set `used_by` on the invite. Return synthetic email.

On any step after (1) failing: best-effort delete the created auth.users (cascades folio_users/auth_methods) + workspace, and revert the invite to pending. Log loudly.

## Demo seed — `lib/auth/demo-seed.ts` `seedDemoWorkspace(workspaceId)`

Insert via admin client (workspace_id explicit): 3 `folio_students` (with default_rate); 2 `folio_lessons` + rosters (one past `completed`, one upcoming `scheduled`); 1 `folio_lesson_journal` on the completed lesson; 1 `folio_homework_templates` + 1 `folio_homework_assignments`; 1 `folio_student_payments` (a payment). Coherent, small, archivable.

## UI

- `/[locale]/invite/[token]/page.tsx` (server) — validate invite, render `InviteAccept` client
  component (mirrors the login page's deep-link + polling; on success `router.push('/<locale>/schedule')`).
- Middleware `PUBLIC_SEGMENTS`/matcher: allow `invite/*`.
- i18n: `Invite` namespace (ru+en).

## Security

- Invite single-use + TTL; consumed atomically; re-validated at redemption.
- `telegram_id` trusted only from the bot-written token (service-role).
- Already-registered Telegram ⇒ log into existing account, do not duplicate.
- Synthetic email is internal (Supabase session only); never shown.
- `folio_signup_invites` + `folio_login_tokens` stay service-role-only.

## Deploy & verify

Migration applied live (confirm policies/columns); bot `supabase functions deploy english-bot`;
web `npm run cf:deploy`. tsc/vitest/build; end-to-end: issue invite → simulate confirm → register
→ authenticated render on the new workspace shows demo data. Adversarial review (RSC, RLS/security,
TS, logic) with per-finding verification.

## Out of scope (deferred)

- Super Admin UI to create/list invites (M9) — invites issued by script for now.
- Email-based invites / magic links (still deferred).
- Student invites into an existing workspace (`folio_invite_tokens`, separate flow).
