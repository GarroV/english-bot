# Folio M2a — Telegram-login Auth Core — Design Spec

> Date: 2026-06-12
> Status: Approved (design), pending implementation plan
> Milestone: M2a (slice of M2 Auth from `Folio/docs/ROADMAP.md`)

---

## 1. Context

Folio (admin platform for tutors) is an extension of english-bot in the same repo
(`english_bot`) and the same Supabase project (`btlglelwxazdxfqdmcti`); Folio tables
use the `folio_` prefix. M1 (foundation) is done: Next.js app in `folio/`, i18n (ru/en),
and base schema (`folio_workspaces`, `folio_users`, `folio_auth_methods`,
`folio_invite_tokens`) with RLS via `folio_current_workspace_id()`.

M2 (Auth) in the roadmap lists email magic link, invite flow, super-admin bootstrap,
Telegram Login Widget, and roles+middleware. After discussion the user re-scoped the
first pass:

- **Telegram login is the only auth method for now** — email/magic-link deferred.
- **n8n is out of scope** (user not ready to adopt it yet).
- **First super_admin is hardcoded via a seed** — proper onboarding deferred.

This spec covers that slice: **M2a — Telegram-login auth core**.

## 2. Scope

**In scope (M2a):**
- Telegram login via **bot deep-link + one-time token** (Approach B), reusing english-bot.
- Bootstrap of the first `super_admin` via a seed migration keyed to the user's `telegram_id`.
- Role-aware route protection (middleware/`proxy.ts` + layout role check).

**Out of scope (later passes):**
- Email / magic-link login.
- Invite flow for creating tutors/students.
- n8n event automation and invite emails.
- Telegram Login Widget (the embeddable widget; blocked on a public domain).

**Consequence:** in M2a only the seeded `super_admin` (the user) can log in. Inviting
other users is the next milestone.

## 3. Chosen approach: bot deep-link + one-time token (Approach B)

Rejected alternative — **Telegram Login Widget (Approach A)**: the official embeddable
widget requires a public HTTPS domain configured on the bot via BotFather, so it cannot
be developed/tested on `localhost` without a Vercel deploy or a dev tunnel, and a bot has
only one login domain (dev/prod conflict). Approach B works locally, reuses the bot the
user already controls, and fits the "Bot Bridge" architecture. See ADR-003.

### Flow (happy path)

1. User opens Folio `/{locale}/login`.
2. Folio server creates a `folio_login_tokens` row (`status=pending`, TTL ~5 min) and
   returns the token + deep-link.
3. Login page shows "Войти через Telegram" → opens
   `https://t.me/<bot_username>?start=folio_login_<token>`.
4. In Telegram the user taps Start → english-bot receives `/start folio_login_<token>`,
   verifies the token (pending, not expired), resolves the `folio_users` row by
   `telegram_id` (from `message.from.id`) via `folio_auth_methods`, sets the token to
   `confirmed` with `telegram_id` + `folio_user_id`, and replies "✅ вернись на сайт".
5. The login page polls a Folio server route; on `confirmed` it calls the session route.
6. Folio server re-verifies the token (confirmed, not consumed, not expired), mints a
   Supabase session for the mapped `auth.users`, sets auth cookies, marks the token
   `consumed`, and the client redirects to the dashboard.
7. Middleware sees the session → allows; the layout reads `role=super_admin`.

## 4. Components

### 4.1 DB — `folio_login_tokens` (new migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `token` | text unique not null | cryptographically random, embedded in deep-link |
| `status` | text not null | `pending` \| `confirmed` \| `consumed` |
| `telegram_id` | bigint | filled by bot on confirm |
| `folio_user_id` | uuid FK → folio_users(id) | resolved on confirm, nullable until then |
| `created_at` | timestamptz not null default now() | |
| `confirmed_at` | timestamptz | |
| `consumed_at` | timestamptz | |
| `expires_at` | timestamptz not null | created_at + ~5 min |

- **RLS:** enabled, **deny-all** (no public policy). This is a pre-auth table; only
  service-role access (english-bot and Folio server routes) touches it. The web client
  never reads/writes it directly.
- Single-use: a token is valid for exactly one session mint; `consumed` is terminal.

### 4.2 english-bot — extend `/start` handler (Bot Bridge, security-critical)

- In `handlers/start.ts`, parse the `/start` payload from `message.text`
  (`/start folio_login_<token>`). Only branch into the Folio-login path when the payload
  has the `folio_login_` prefix; otherwise behave exactly as today.
- New `lib/db.ts` function (e.g. `confirmFolioLogin(token, telegramId)`): looks up a
  `pending`, non-expired token; resolves `folio_users` by `telegram_id` via
  `folio_auth_methods`; on success sets `telegram_id`, `folio_user_id`, `status=confirmed`,
  `confirmed_at`; returns a result enum (`confirmed` / `not_linked` / `invalid`).
- Bot replies:
  - linked → "✅ Вход в Folio подтверждён, вернись на сайт."
  - not linked → "Этот Telegram не привязан к Folio."
  - invalid/expired → "Ссылка устарела, открой вход заново."
- `telegram_id` is taken **only** from `message.from.id`, never from text.
- english-bot already uses `SUPABASE_SERVICE_ROLE_KEY`, so it writes `folio_login_tokens`
  with service role (bypassing RLS).

### 4.3 Folio web — login page + server routes

- `folio/src/app/[locale]/login/page.tsx` (public): requests a token, renders the
  Telegram button, polls status, redirects on success. Bot username from
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
- Server routes (service-role, server-only):
  - `POST /api/auth/telegram/start` → create token, return `{token, deepLink}`.
  - `GET /api/auth/telegram/status?token=...` → return `{status}` (no sensitive data).
  - `POST /api/auth/telegram/session` → verify confirmed+unconsumed+unexpired, mint
    session, set cookies, mark consumed.
- Polling timeout ~2–3 min → "ссылка истекла, попробуй снова".
- Business logic lives in `folio/src/lib/auth/*`, not in components (per Folio CLAUDE.md).

### 4.4 Session minting (server-side) — design risk to resolve in planning

`folio_users.id = auth.users.id`; the auth user is created by the seed, so it already
exists at login time. The mechanism to turn "confirmed token" into a Supabase session is
the one open technical decision, to be validated against **current Supabase docs** during
the writing-plans phase (the stack may differ from training data — see `Folio/AGENTS.md`).
Leading candidates:

- **(a) Admin API** `generateLink({type:'magiclink'})` → `verifyOtp` server-side to
  obtain a session → set cookies via `@supabase/ssr`. Needs an email on the auth user
  (seed a synthetic or real email).
- **(b) Custom JWT** signed with the project's signing key, set as the Supabase auth
  cookie. No email needed; must handle refresh-token semantics and confirm the current
  signing-key model (asymmetric keys vs legacy JWT secret).

Whichever is chosen, secrets stay server-side only.

### 4.5 Bootstrap super_admin (seed migration)

A seed migration inserts, in order:
1. `auth.users` row for the user (synthetic or real email — required by the FK).
2. `folio_workspaces` (first workspace).
3. `folio_users` (`id` = the auth user id, `role=super_admin`, `workspace_id`,
   `telegram_id` = `ADMIN_USER_ID`).
4. `folio_auth_methods` (`provider='telegram'`, `provider_uid=<telegram_id>`, `user_id`).
5. Set `folio_workspaces.owner_id`.

- The concrete `telegram_id` (= english-bot's `ADMIN_USER_ID`) is substituted at
  implementation time.
- Clearly marked as a **temporary bootstrap**, to be replaced by proper invite/onboarding.

### 4.6 Roles + route protection

- Extend `folio/src/proxy.ts` (currently next-intl only) to compose next-intl routing
  with a session check using `@supabase/ssr`.
- Public routes: `/`, `/{locale}`, `/{locale}/login`, and the auth API routes. Everything
  else requires a session.
- Role gating: middleware enforces authenticated; the protected layout reads
  `folio_users.role`. M2a only has `super_admin`, but the structure is ready for
  `tutor`/`student`.

## 5. Error handling & security

- Tokens: cryptographically random, short TTL, single-use; re-verified before session mint.
- `telegram_id` trusted only from the Telegram update's `message.from.id`.
- `folio_login_tokens`: deny-all RLS, service-role only; client never touches it.
- Bot token and the session signing secret stay in Supabase secrets / Folio server env
  (`.env.local`), never reach the client.
- `workspace_id` enforced by RLS and checked at the edge (Folio CLAUDE.md rule).
- Existing `/start` behavior must remain unchanged when there is no `folio_login_` payload.

## 6. Testing

- **Unit:** token generation / TTL / single-use; `/start` payload parsing
  (`folio_login_<token>` extraction); `folio_users` resolution by `telegram_id`.
- **Integration:** bot `confirmFolioLogin` against the DB; the session-mint route.
- **Bot tests** run via `deno test supabase/functions/english-bot/lib/ --allow-env`.
- **E2E (Playwright):** deferred until a deployed/tunneled environment exists.

## 7. i18n

- All new login-page strings added to `folio/messages/ru.json` and `en.json` (ru default).
- User data (names) never translated.

## 8. Definition of Done (docs)

- `Folio/docs/DATA_MODEL.md` — add `folio_login_tokens`.
- `Folio/docs/ARCHITECTURE.md` — add the Telegram-login flow and Bot Bridge auth.
- `Folio/docs/ROADMAP.md` — mark M2a items; note Telegram-first / email-deferred.
- `Folio/docs/decisions/003-telegram-auth.md` — ADR: bot deep-link over Login Widget;
  Telegram-first over email.
- english-bot `docs/CHANGELOG.md` + `docs/BOT.md` — new `/start` payload handling and
  `folio_login_tokens`.
- After editing the bot: commit → push → `supabase functions deploy english-bot --no-verify-jwt`.

## 9. Open question carried into planning

- Exact Supabase session-minting mechanism (§4.4) — resolve against current Supabase docs.
