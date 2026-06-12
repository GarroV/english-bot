# Folio M2a — Telegram-login Auth Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the seeded super_admin log into Folio entirely through Telegram (bot deep-link + one-time token), with role-aware route protection.

**Architecture:** Folio's login page mints a one-time token in `folio_login_tokens`, opens a `t.me` deep-link, and polls. english-bot's `/start` handler confirms the token against the sender's `telegram_id`. A Folio server route then exchanges the confirmed token for a Supabase session via admin `generateLink` + `verifyOtp`. A seed migration bootstraps the first super_admin.

**Tech Stack:** Next.js 16.2.7 (App Router, `proxy.ts`), React 19, `@supabase/ssr` + `@supabase/supabase-js`, Supabase Postgres (project `btlglelwxazdxfqdmcti`), Deno (english-bot Edge Function), Vitest (Folio unit tests), `deno test` (bot unit tests), next-intl (ru/en).

**Spec:** `docs/superpowers/specs/2026-06-12-folio-m2a-telegram-auth-design.md`

---

## File Structure

**Folio (`folio/`):**
- `src/lib/supabase/server.ts` — request-scoped SSR client (reads/writes auth cookies). NEW
- `src/lib/supabase/client.ts` — browser client. NEW
- `src/lib/supabase/admin.ts` — service/secret-key admin client (server-only). NEW
- `src/lib/auth/login-tokens.ts` — token lifecycle (create / status / consume) over the admin client. NEW
- `src/lib/auth/token-rules.ts` — pure predicates (`isRedeemable`), unit-tested. NEW
- `src/lib/auth/session.ts` — `mintSessionForUser(email)` via generateLink + verifyOtp. NEW
- `src/lib/auth/__tests__/token-rules.test.ts` — Vitest. NEW
- `src/app/api/auth/telegram/start/route.ts` — POST: create token. NEW
- `src/app/api/auth/telegram/status/route.ts` — GET: poll status. NEW
- `src/app/api/auth/telegram/session/route.ts` — POST: consume token → mint session. NEW
- `src/app/[locale]/login/page.tsx` — server page shell. NEW
- `src/app/[locale]/login/LoginPanel.tsx` — client component (button + polling). NEW
- `src/app/[locale]/(app)/dashboard/page.tsx` — minimal protected page reading role. NEW
- `src/proxy.ts` — compose next-intl with optimistic auth redirect. MODIFY
- `messages/ru.json`, `messages/en.json` — login + dashboard strings. MODIFY
- `.env.local` — Supabase + bot env. NEW (not committed)
- `.env.example` — documented env template. NEW (committed)
- `vitest.config.ts`, `package.json` — test setup. NEW / MODIFY

**Shared DB (`supabase/migrations/`):**
- `<ts>_folio_login_tokens.sql` — token table + RLS. NEW
- `<ts>_folio_seed_super_admin.sql` — bootstrap seed. NEW

**english-bot (`supabase/functions/english-bot/`):**
- `lib/db.ts` — `confirmFolioLogin()`. MODIFY
- `lib/folio_login.ts` — pure `parseLoginPayload()`. NEW
- `lib/folio_login.test.ts` — deno test. NEW
- `handlers/start.ts` — branch on `folio_login_` payload. MODIFY

---

## Conventions for every task

- TypeScript strict, no `any` without a `// reason:` comment (Folio CLAUDE.md).
- No secrets in code; only `.env.local` / Supabase secrets.
- Each new text string → both `ru.json` and `en.json`.
- Commit after each task. Push at the end of the session. The bot deploy happens once, in Task 12.
- Commit message type per change: `feat` / `test` / `chore` / `docs`.

---

### Task 1: Install Supabase libraries and test runner

**Files:**
- Modify: `folio/package.json`
- Create: `folio/vitest.config.ts`

- [ ] **Step 1: Install runtime + dev deps**

Run (from `folio/`):
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest
```

- [ ] **Step 2: Add the test script**

Edit `folio/package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `folio/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify the runner boots (no tests yet is fine)**

Run: `cd folio && npm test`
Expected: exits 0 with "No test files found" or runs 0 tests. (If it errors, fix config before continuing.)

- [ ] **Step 5: Commit**

```bash
git add folio/package.json folio/package-lock.json folio/vitest.config.ts
git commit -m "chore(folio): add @supabase/ssr, supabase-js, vitest"
```

---

### Task 2: Environment template

**Files:**
- Create: `folio/.env.example` (committed)
- Create: `folio/.env.local` (NOT committed — already covered by Next's gitignore)

- [ ] **Step 1: Create `folio/.env.example`**

```bash
# Supabase (project btlglelwxazdxfqdmcti) — get from Dashboard > Settings > API Keys
NEXT_PUBLIC_SUPABASE_URL=https://btlglelwxazdxfqdmcti.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx

# Telegram bot used for login deep-links (same bot as english-bot)
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_username_without_at
```

- [ ] **Step 2: Create `folio/.env.local`** with the real values (publishable + secret keys from the Supabase dashboard, real bot username). Do not commit.

- [ ] **Step 3: Confirm `.env*.local` is gitignored**

Run: `cd folio && git check-ignore .env.local`
Expected: prints `.env.local` (ignored). If not, add `.env*.local` to `folio/.gitignore`.

- [ ] **Step 4: Commit the example only**

```bash
git add folio/.env.example
git commit -m "chore(folio): add .env.example for Supabase + Telegram login"
```

---

### Task 3: Supabase clients (browser, server, admin)

**Files:**
- Create: `folio/src/lib/supabase/client.ts`
- Create: `folio/src/lib/supabase/server.ts`
- Create: `folio/src/lib/supabase/admin.ts`

- [ ] **Step 1: Browser client — `client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (uses the publishable key).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

- [ ] **Step 2: Server (SSR) client — `server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Request-scoped Supabase client that reads/writes the auth cookies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; proxy refreshes cookies.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Admin client — `admin.ts`**

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (secret key). Never import this into client components.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `cd folio && npx tsc --noEmit`
Expected: no errors from these files.

- [ ] **Step 5: Commit**

```bash
git add folio/src/lib/supabase
git commit -m "feat(folio): add Supabase browser/server/admin clients"
```

---

### Task 4: Token rules (pure, TDD)

**Files:**
- Create: `folio/src/lib/auth/token-rules.ts`
- Test: `folio/src/lib/auth/__tests__/token-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isRedeemable, type LoginTokenRow } from "../token-rules";

const base: LoginTokenRow = {
  status: "confirmed",
  expires_at: "2999-01-01T00:00:00Z",
  consumed_at: null,
  folio_user_id: "u1",
};

describe("isRedeemable", () => {
  it("true for confirmed, unexpired, unconsumed with a user", () => {
    expect(isRedeemable(base, Date.parse("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("false when pending", () => {
    expect(isRedeemable({ ...base, status: "pending" }, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });
  it("false when already consumed", () => {
    expect(isRedeemable({ ...base, consumed_at: "2026-01-01T00:00:00Z" }, Date.parse("2026-01-02T00:00:00Z"))).toBe(false);
  });
  it("false when expired", () => {
    expect(isRedeemable({ ...base, expires_at: "2026-01-01T00:00:00Z" }, Date.parse("2026-06-01T00:00:00Z"))).toBe(false);
  });
  it("false when no user linked", () => {
    expect(isRedeemable({ ...base, folio_user_id: null }, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd folio && npm test`
Expected: FAIL — cannot find module `../token-rules`.

- [ ] **Step 3: Implement `token-rules.ts`**

```ts
export type LoginTokenStatus = "pending" | "confirmed" | "consumed";

export interface LoginTokenRow {
  status: LoginTokenStatus;
  expires_at: string;
  consumed_at: string | null;
  folio_user_id: string | null;
}

// A token can be exchanged for a session only when it is confirmed by the bot,
// not yet consumed, not expired, and linked to a folio user.
export function isRedeemable(row: LoginTokenRow, nowMs: number): boolean {
  if (row.status !== "confirmed") return false;
  if (row.consumed_at !== null) return false;
  if (!row.folio_user_id) return false;
  return Date.parse(row.expires_at) > nowMs;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd folio && npm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add folio/src/lib/auth/token-rules.ts folio/src/lib/auth/__tests__/token-rules.test.ts
git commit -m "feat(folio): add login-token redeemability rules with tests"
```

---

### Task 5: Migration — `folio_login_tokens`

**Files:**
- Create: `supabase/migrations/<ts>_folio_login_tokens.sql` (use a timestamp after `20260608120000`, e.g. `20260612120000`)

- [ ] **Step 1: Write the migration**

```sql
-- Folio M2a: one-time Telegram login tokens.
-- Pre-auth table: written by english-bot (service role) and Folio server routes only.
-- RLS is enabled with NO policy => deny-all for anon/authenticated; service role bypasses RLS.

create table folio_login_tokens (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique,
  status         text not null default 'pending' check (status in ('pending','confirmed','consumed')),
  telegram_id    bigint,
  folio_user_id  uuid references folio_users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  consumed_at    timestamptz,
  expires_at     timestamptz not null
);

create index folio_login_tokens_token_idx on folio_login_tokens (token);

alter table folio_login_tokens enable row level security;
-- No policies on purpose: only service-role (bot + Folio server routes) may touch this table.
```

- [ ] **Step 2: Apply to the linked project**

Run (from repo root): `supabase db push`
Expected: applies `<ts>_folio_login_tokens.sql` with no error.

- [ ] **Step 3: Verify the table exists**

Run: `supabase db query --linked "select column_name, data_type from information_schema.columns where table_name='folio_login_tokens' order by ordinal_position"`
Expected: lists `id, token, status, telegram_id, folio_user_id, created_at, confirmed_at, consumed_at, expires_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_folio_login_tokens.sql
git commit -m "feat(db): add folio_login_tokens table with deny-all RLS"
```

---

### Task 6: Login-token service (create / status / consume)

**Files:**
- Create: `folio/src/lib/auth/login-tokens.ts`

- [ ] **Step 1: Implement the service**

```ts
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRedeemable, type LoginTokenStatus } from "@/lib/auth/token-rules";

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TABLE = "folio_login_tokens";

export interface CreatedToken {
  token: string;
  deepLink: string;
}

// Create a pending login token and return the Telegram deep-link to confirm it.
export async function createLoginToken(): Promise<CreatedToken> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const admin = createAdminClient();

  const { error } = await admin
    .from(TABLE)
    .insert({ token, status: "pending", expires_at: expiresAt });
  if (error) throw new Error(`createLoginToken failed: ${error.message}`);

  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!;
  return { token, deepLink: `https://t.me/${bot}?start=folio_login_${token}` };
}

// Return only the status (no sensitive data) for the polling endpoint.
export async function getLoginTokenStatus(token: string): Promise<LoginTokenStatus | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("status")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`getLoginTokenStatus failed: ${error.message}`);
  return (data?.status as LoginTokenStatus) ?? null;
}

// Atomically consume a confirmed token; returns the folio user id or null if not redeemable.
export async function consumeLoginToken(token: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("status, expires_at, consumed_at, folio_user_id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`consumeLoginToken read failed: ${error.message}`);
  if (!data || !isRedeemable(data, Date.now())) return null;

  // Guard against double-consume via a conditional update on consumed_at IS NULL.
  const { data: updated, error: updErr } = await admin
    .from(TABLE)
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null)
    .select("folio_user_id")
    .maybeSingle();
  if (updErr) throw new Error(`consumeLoginToken update failed: ${updErr.message}`);
  return (updated?.folio_user_id as string) ?? null;
}
```

- [ ] **Step 2: Type-check**

Run: `cd folio && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add folio/src/lib/auth/login-tokens.ts
git commit -m "feat(folio): add login-token service (create/status/consume)"
```

---

### Task 7: Session minting helper

**Files:**
- Create: `folio/src/lib/auth/session.ts`

- [ ] **Step 1: Implement `mintSessionForUser`**

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

// Establish a Supabase session for an existing auth user by email.
// Admin generates a magic-link OTP hash; the request-scoped client verifies it,
// which writes the auth cookies. Returns true on success.
export async function mintSessionForUser(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) return false;

  const supabase = await createServerSupabase();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  return !verifyErr;
}
```

- [ ] **Step 2: Type-check**

Run: `cd folio && npx tsc --noEmit`
Expected: no errors. (If `properties.hashed_token` is not typed, the optional chaining still compiles; do not add `any`.)

- [ ] **Step 3: Commit**

```bash
git add folio/src/lib/auth/session.ts
git commit -m "feat(folio): add Supabase session minting via generateLink+verifyOtp"
```

---

### Task 8: Auth API route handlers

**Files:**
- Create: `folio/src/app/api/auth/telegram/start/route.ts`
- Create: `folio/src/app/api/auth/telegram/status/route.ts`
- Create: `folio/src/app/api/auth/telegram/session/route.ts`

- [ ] **Step 1: `start/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createLoginToken } from "@/lib/auth/login-tokens";

export async function POST() {
  const created = await createLoginToken();
  return NextResponse.json(created);
}
```

- [ ] **Step 2: `status/route.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLoginTokenStatus } from "@/lib/auth/login-tokens";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  const status = await getLoginTokenStatus(token);
  if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ status });
}
```

- [ ] **Step 3: `session/route.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth/login-tokens";
import { mintSessionForUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({ token: null }));
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const userId = await consumeLoginToken(token);
  if (!userId) return NextResponse.json({ error: "not redeemable" }, { status: 401 });

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("folio_users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.email) return NextResponse.json({ error: "user has no email" }, { status: 409 });

  const ok = await mintSessionForUser(user.email);
  if (!ok) return NextResponse.json({ error: "session mint failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check + build**

Run: `cd folio && npx tsc --noEmit && npm run build`
Expected: build succeeds; the three routes appear in the route list.

- [ ] **Step 5: Commit**

```bash
git add folio/src/app/api/auth/telegram
git commit -m "feat(folio): add telegram-login API routes (start/status/session)"
```

---

### Task 9: Login page + client polling panel + dashboard

**Files:**
- Create: `folio/src/app/[locale]/login/page.tsx`
- Create: `folio/src/app/[locale]/login/LoginPanel.tsx`
- Create: `folio/src/app/[locale]/(app)/dashboard/page.tsx`
- Modify: `folio/messages/ru.json`, `folio/messages/en.json`

- [ ] **Step 1: Add i18n strings**

In `ru.json` add:
```json
"Login": {
  "title": "Вход в Folio",
  "subtitle": "Войдите через Telegram",
  "button": "Войти через Telegram",
  "waiting": "Подтвердите вход в Telegram…",
  "expired": "Ссылка истекла, попробуйте снова",
  "error": "Не удалось войти. Попробуйте ещё раз"
},
"Dashboard": { "title": "Панель", "role": "Роль" }
```
In `en.json` add the same keys with English values (`"Sign in to Folio"`, `"Sign in with Telegram"`, `"Confirm the login in Telegram…"`, `"The link expired, try again"`, `"Could not sign in. Try again"`, `"Dashboard"`, `"Role"`).

- [ ] **Step 2: `login/page.tsx` (server shell)**

```tsx
import { useTranslations } from "next-intl";
import { LoginPanel } from "./LoginPanel";

export default function LoginPage() {
  const t = useTranslations("Login");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
      <LoginPanel
        labels={{
          button: t("button"),
          waiting: t("waiting"),
          expired: t("expired"),
          error: t("error"),
        }}
      />
    </main>
  );
}
```

- [ ] **Step 3: `login/LoginPanel.tsx` (client)**

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface Labels { button: string; waiting: string; expired: string; error: string; }
type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min

export function LoginPanel({ labels }: { labels: Labels }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const router = useRouter();
  const polls = useRef(0);

  const poll = useCallback(async (token: string) => {
    polls.current += 1;
    if (polls.current > MAX_POLLS) { setPhase("expired"); return; }

    const res = await fetch(`/api/auth/telegram/status?token=${encodeURIComponent(token)}`);
    const { status } = await res.json();
    if (status === "confirmed") {
      const s = await fetch("/api/auth/telegram/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (s.ok) { router.push("/dashboard"); return; }
      setPhase("error"); return;
    }
    setTimeout(() => poll(token), POLL_MS);
  }, [router]);

  const start = useCallback(async () => {
    setPhase("waiting");
    polls.current = 0;
    const res = await fetch("/api/auth/telegram/start", { method: "POST" });
    const { token, deepLink } = await res.json();
    window.open(deepLink, "_blank");
    poll(token);
  }, [poll]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={start}
        disabled={phase === "waiting"}
        className="rounded-md bg-sky-600 px-5 py-2.5 font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
      >
        {labels.button}
      </button>
      {phase === "waiting" && <p className="text-sm text-zinc-500">{labels.waiting}</p>}
      {phase === "expired" && <p className="text-sm text-amber-600">{labels.expired}</p>}
      {phase === "error" && <p className="text-sm text-red-600">{labels.error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `(app)/dashboard/page.tsx` (protected, reads role)**

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: "ru" });

  const { data: profile } = await supabase
    .from("folio_users")
    .select("role, name")
    .eq("id", user!.id)
    .maybeSingle();

  const t = await getTranslations("Dashboard");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {t("role")}: {profile?.role ?? "—"} ({profile?.name ?? "—"})
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Build**

Run: `cd folio && npm run build`
Expected: `/[locale]/login` and `/[locale]/dashboard` compile. (No live login yet — seed lands in Task 11.)

- [ ] **Step 6: Commit**

```bash
git add folio/src/app/[locale]/login folio/src/app/[locale]/\(app\) folio/messages
git commit -m "feat(folio): add Telegram login page, polling panel, dashboard"
```

---

### Task 10: Proxy — optimistic auth redirect + intl

**Files:**
- Modify: `folio/src/proxy.ts`

Note: read the current `proxy.ts` first; it currently only runs the next-intl middleware. Per Next 16 docs, `proxy` does **optimistic** checks only (cookie presence) — real verification stays in the dashboard server component (Task 9, Step 4).

- [ ] **Step 1: Replace `proxy.ts` body**

```ts
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Locale-aware path is like /ru/dashboard ; strip the locale prefix for matching.
const PUBLIC_SEGMENTS = ["", "login"]; // "" = locale root (landing)

function isPublicPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean); // ["ru","dashboard"]
  const afterLocale = parts.slice(1).join("/");       // "dashboard"
  return PUBLIC_SEGMENTS.includes(afterLocale);
}

// Optimistic Supabase session check: presence of an auth cookie. Real check is server-side.
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes bypass intl + auth gating here (each route guards itself).
  if (pathname.startsWith("/api")) return NextResponse.next();

  if (!isPublicPath(pathname) && !hasSupabaseSession(request)) {
    const parts = pathname.split("/").filter(Boolean);
    const locale = routing.locales.includes(parts[0] as typeof routing.locales[number])
      ? parts[0]
      : routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip Next internals and static files; run on everything else.
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

- [ ] **Step 2: Build**

Run: `cd folio && npm run build`
Expected: builds. Manually: visiting `/ru/dashboard` without a session cookie should redirect to `/ru/login` (verify in Task 11 once seed exists; for now confirm no build/type error).

- [ ] **Step 3: Commit**

```bash
git add folio/src/proxy.ts
git commit -m "feat(folio): proxy optimistic auth redirect + intl composition"
```

---

### Task 11: Seed migration — bootstrap super_admin

**Files:**
- Create: `supabase/migrations/<ts>_folio_seed_super_admin.sql` (timestamp after Task 5's file)

Prereq: obtain the admin Telegram id. Run:
`supabase db query --linked "select telegram_id from eb_users order by created_at limit 5"`
— or read english-bot's `ADMIN_USER_ID` secret value. Substitute it for `<ADMIN_TELEGRAM_ID>` below. Email is `v.garro@dodobrands.io`.

- [ ] **Step 1: Write the seed**

```sql
-- Folio M2a: TEMPORARY bootstrap of the first super_admin.
-- Replace with a proper onboarding flow later. Idempotent via fixed UUIDs + ON CONFLICT.

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ws_id   uuid := '00000000-0000-0000-0000-0000000000b1';
  v_email   text := 'v.garro@dodobrands.io';
  v_tg      bigint := <ADMIN_TELEGRAM_ID>;
begin
  -- 1) auth user (passwordless; email confirmed so magic-link/verifyOtp works)
  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}'
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
```

- [ ] **Step 2: Apply**

Run: `supabase db push`
Expected: applies the seed with no error.

- [ ] **Step 3: Verify the rows**

Run: `supabase db query --linked "select u.role, u.email, u.telegram_id, m.provider, m.provider_uid from folio_users u join folio_auth_methods m on m.user_id = u.id"`
Expected: one row, `role=super_admin`, your email, your telegram_id, `provider=telegram`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_folio_seed_super_admin.sql
git commit -m "feat(db): seed first Folio super_admin (temporary bootstrap)"
```

---

### Task 12: english-bot — confirm login token (Bot Bridge)

**Files:**
- Create: `supabase/functions/english-bot/lib/folio_login.ts`
- Test: `supabase/functions/english-bot/lib/folio_login.test.ts`
- Modify: `supabase/functions/english-bot/lib/db.ts`
- Modify: `supabase/functions/english-bot/handlers/start.ts`

- [ ] **Step 1: Write the failing parser test**

```ts
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { parseLoginPayload } from "./folio_login.ts";

Deno.test("parses folio_login payload", () => {
  assertEquals(parseLoginPayload("/start folio_login_abc123"), "abc123");
});
Deno.test("returns null for plain /start", () => {
  assertEquals(parseLoginPayload("/start"), null);
});
Deno.test("returns null for other payloads", () => {
  assertEquals(parseLoginPayload("/start somethingelse"), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/english-bot/lib/folio_login.test.ts --allow-env`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `folio_login.ts` parser**

```ts
// Extract the login token from a "/start folio_login_<token>" command, else null.
export function parseLoginPayload(text: string): string | null {
  const m = text.trim().match(/^\/start\s+folio_login_(\S+)$/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/english-bot/lib/folio_login.test.ts --allow-env`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `confirmFolioLogin` to `lib/db.ts`**

Append (the `supabase` client in this file already uses the service-role key):
```ts
// Confirm a Folio login token for a Telegram user. Returns the outcome for the bot reply.
export async function confirmFolioLogin(
  token: string,
  telegramId: number,
): Promise<"confirmed" | "not_linked" | "invalid"> {
  // 1) token must exist, be pending, and not expired
  const { data: tok } = await supabase
    .from("folio_login_tokens")
    .select("id, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!tok || tok.status !== "pending" || Date.parse(tok.expires_at) <= Date.now()) {
    return "invalid";
  }

  // 2) resolve the folio user by telegram auth method
  const { data: method } = await supabase
    .from("folio_auth_methods")
    .select("user_id")
    .eq("provider", "telegram")
    .eq("provider_uid", String(telegramId))
    .maybeSingle();
  if (!method) return "not_linked";

  // 3) confirm
  const { error } = await supabase
    .from("folio_login_tokens")
    .update({
      status: "confirmed",
      telegram_id: telegramId,
      folio_user_id: method.user_id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending");
  return error ? "invalid" : "confirmed";
}
```

- [ ] **Step 6: Branch `/start` in `handlers/start.ts`**

At the top of `handleStart`, before the existing admin/registered logic, add (and import `parseLoginPayload` from `../lib/folio_login.ts` and `confirmFolioLogin` from `../lib/db.ts`):
```ts
  const loginToken = parseLoginPayload(message.text ?? "");
  if (loginToken) {
    const result = await confirmFolioLogin(loginToken, id);
    const reply =
      result === "confirmed"
        ? "✅ Вход в Folio подтверждён. Вернись на сайт."
        : result === "not_linked"
          ? "Этот Telegram не привязан к Folio."
          : "Ссылка устарела. Открой вход в Folio заново.";
    await sendMessage(chatId, reply);
    return;
  }
```
(`id` and `chatId` are already destructured at the top of `handleStart`.)

- [ ] **Step 7: Run the full bot test suite**

Run: `deno test supabase/functions/english-bot/lib/ --allow-env`
Expected: all pass (existing + new).

- [ ] **Step 8: Commit, push, deploy**

```bash
git add supabase/functions/english-bot/lib/folio_login.ts supabase/functions/english-bot/lib/folio_login.test.ts supabase/functions/english-bot/lib/db.ts supabase/functions/english-bot/handlers/start.ts
git commit -m "feat(bot): confirm Folio login tokens via /start folio_login_ deep-link"
git push
supabase functions deploy english-bot --no-verify-jwt
```

---

### Task 13: End-to-end manual verification

**Files:** none (manual)

- [ ] **Step 1: Start Folio**

Run: `cd folio && npm run dev`
Open `http://localhost:3000/ru/login`.

- [ ] **Step 2: Run the login flow**

Click "Войти через Telegram" → confirm in the bot chat → bot replies "✅ … вернись на сайт" → the web page redirects to `/ru/dashboard` showing `Роль: super_admin`.

- [ ] **Step 3: Verify gating**

In a fresh/incognito browser, open `http://localhost:3000/ru/dashboard` → redirected to `/ru/login`.

- [ ] **Step 4: Verify single-use**

Re-POST the same consumed token to `/api/auth/telegram/session` (e.g. via DevTools) → 401 `not redeemable`.

- [ ] **Step 5: Note results** in the PR/commit description. If any step fails, debug before closing M2a.

---

### Task 14: Documentation (Definition of Done)

**Files:**
- Modify: `Folio/docs/DATA_MODEL.md`, `Folio/docs/ARCHITECTURE.md`, `Folio/docs/ROADMAP.md`
- Create: `Folio/docs/decisions/003-telegram-auth.md`
- Modify: `docs/CHANGELOG.md`, `docs/BOT.md`

- [ ] **Step 1: `DATA_MODEL.md`** — add a `folio_login_tokens ✅` section with the columns from Task 5; note deny-all RLS; add the migration to "Применённые миграции".

- [ ] **Step 2: `ARCHITECTURE.md`** — add a "Telegram-login (M2a)" section describing the deep-link + one-time-token flow and that proxy does optimistic checks only.

- [ ] **Step 3: `ROADMAP.md`** — under M2, mark the done items: Telegram login, super_admin bootstrap, roles+middleware; note email/magic-link + invite emails + Login Widget deferred.

- [ ] **Step 4: ADR `Folio/docs/decisions/003-telegram-auth.md`** — Date/Status/Context/Decision/Consequences: chose bot deep-link over Login Widget (localhost, reuse bot); Telegram-first over email; session via generateLink+verifyOtp; temporary seeded super_admin.

- [ ] **Step 5: english-bot `docs/CHANGELOG.md`** (new dated entry) + `docs/BOT.md` (note `/start folio_login_<token>` handling, `lib/folio_login.ts`, and the `folio_login_tokens` table).

- [ ] **Step 6: Commit + push**

```bash
git add Folio/docs docs/CHANGELOG.md docs/BOT.md
git commit -m "docs(folio): document M2a Telegram-login auth (DATA_MODEL, ARCHITECTURE, ROADMAP, ADR-003, BOT/CHANGELOG)"
git push
```

---

## Self-Review

**Spec coverage:**
- Telegram login (bot deep-link + token) → Tasks 5, 6, 8, 9, 12, 13. ✓
- super_admin bootstrap (seed) → Task 11. ✓
- Roles + route protection → Tasks 9 (server check) + 10 (proxy). ✓
- `folio_login_tokens` deny-all RLS → Task 5. ✓
- Session minting (§4.4 decision) → resolved to generateLink+verifyOtp, Task 7. ✓
- `telegram_id` only from `message.from.id` → Task 12 Step 6 (uses `id`). ✓
- Single-use token → Task 6 (`consumed_at IS NULL` guard) + Task 13 Step 4. ✓
- i18n strings ru+en → Task 9 Step 1. ✓
- Docs DoD → Task 14. ✓
- Deferred (email, invites, n8n, Login Widget) → not implemented, by design. ✓

**Placeholder scan:** `<ts>` and `<ADMIN_TELEGRAM_ID>` are explicit substitutions with instructions (Tasks 5, 11), not vague TODOs. No "add error handling"-style gaps.

**Type consistency:** `LoginTokenRow`/`LoginTokenStatus`/`isRedeemable` (Task 4) reused in Task 6; `createAdminClient` (Task 3) used in Tasks 6/7/8; `createClient` server (Task 3) used in Tasks 7/9; `confirmFolioLogin` return union matches the bot reply switch (Task 12). Consistent.

## Notes carried for execution
- Telegram Login Widget, email/magic-link, invite flow, n8n: explicitly out of scope (next milestones).
- `mintSessionForUser` relies on the seeded auth user's confirmed email; that's guaranteed by Task 11.
- Verify `data.properties.hashed_token` against the installed `@supabase/supabase-js` types during Task 7; keep optional chaining rather than casting to `any`.
