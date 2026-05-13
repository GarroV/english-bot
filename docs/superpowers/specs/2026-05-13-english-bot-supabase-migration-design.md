# English Bot — Supabase Migration Design

**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** Migrate Telegram English homework bot from local Python/polling to Deno/Edge Functions on Supabase, with multi-user support, invite-based access control, and assignment caching.

---

## 1. Goals

- Bot runs always-on without manual `run.sh`
- Multi-user support (multiple teachers, scalable)
- Invite-based access control
- Assignment cache: show similar past assignments before generating new ones
- Consistent with Swarm Brain infrastructure (same Supabase deployment workflow)

## 2. Architecture

```
Telegram  →  webhook  →  Supabase Edge Function (Deno)
                                    │
                          ┌─────────┼──────────┐
                          │         │          │
                     eb_sessions  eb_assignments  eb_users
```

**Runtime:** Deno, Supabase Edge Functions  
**Telegram:** webhook mode (replaces polling)  
**Deploy:** `supabase functions deploy english-bot --no-verify-jwt`  
**Supabase project:** new dedicated project (separate from Swarm Brain)

### Credentials

| Variable | Source |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | current `.env` (same bot) |
| `ANTHROPIC_KEY` | current `.env` |
| `SUPABASE_URL` | new project |
| `SUPABASE_SERVICE_ROLE_KEY` | new project |
| `ADMIN_USER_ID` | admin's Telegram ID |

### File Structure

```
supabase/functions/english-bot/
  index.ts              — routing, webhook handler
  lib/
    supabase.ts         — Supabase client
    telegram.ts         — sendMessage, inline keyboards
    claude.ts           — assignment generation, editing
    pdf.ts              — PDF generation
    types.ts            — shared types
  handlers/
    start.ts            — /start, invite-code registration
    request.ts          — request input + confirmation
    generate.ts         — cache lookup + generation
    edit.ts             — assignment editing
    pdf.ts              — PDF download
    admin.ts            — /invite, /users commands
```

## 3. Database Schema

```sql
-- White list + user profiles
create table eb_users (
  telegram_id  bigint primary key,
  username     text,
  name         text,
  invited_by   bigint references eb_users(telegram_id),
  created_at   timestamptz default now()
);

-- Conversation state (replaces in-memory dict)
create table eb_sessions (
  telegram_id  bigint primary key references eb_users(telegram_id),
  state        text not null,
  context      jsonb default '{}',
  updated_at   timestamptz default now()
);

-- Assignment cache + history
create table eb_assignments (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  bigint references eb_users(telegram_id),
  level        text,
  topic        text,
  age_group    text,
  request_text text,
  content      text,
  embedding    vector(512),
  created_at   timestamptz default now()
);

-- Invite codes
create table eb_invitations (
  code        text primary key,
  created_by  bigint references eb_users(telegram_id),
  used_by     bigint references eb_users(telegram_id),
  used_at     timestamptz,
  created_at  timestamptz default now()
);
```

**Embeddings:** generated from normalized request string (`"A2 food restaurants teenager"`) via Supabase built-in AI (`gte-small`, 512 dimensions). No extra API keys required.

**Similarity threshold:** cosine distance ≤ 0.15 (i.e., similarity ≥ 0.85).

## 4. Conversation Flow

States: `WAITING_REQUEST` → `CONFIRMING` → `CACHE_OFFER` (new) → `POST_GENERATION` → `EDITING`

```
/start
  → not in eb_users → ask for invite code → validate → insert into eb_users
  → already registered → WAITING_REQUEST

User sends request ("A2, food, teenager")
  → save to session context
  → show confirmation + buttons [✅ Generate] [✏️ Change request]
  → CONFIRMING

User taps "Generate"
  → embed request → search eb_assignments (pgvector)

  Found similar (distance ≤ 0.15):
    → show preview (first 300 chars) + buttons:
      [✅ Use this]  [🔄 Generate new]
    → CACHE_OFFER

    "Use this" → load full content from eb_assignments → POST_GENERATION
    "Generate new" → call Claude → save to eb_assignments → POST_GENERATION

  Not found:
    → call Claude → save to eb_assignments → POST_GENERATION

POST_GENERATION
  → buttons: [✏️ Edit something]  [📄 Download PDF]

User taps "Edit something"
  → EDITING: ask what to change
  → call Claude with original + edit request
  → save edited version to eb_sessions.context only (not to eb_assignments cache)
  → POST_GENERATION
```

## 5. Access Control

**Registration:** invite-code flow on `/start`. Exception: the user whose `telegram_id` matches `ADMIN_USER_ID` is auto-registered on first `/start` without an invite code.

**Admin commands:**
- `/invite` — generate a one-time code (admin only, checked via `ADMIN_USER_ID`)
- `/users` — list registered users

**Access check:** every handler checks `eb_users` for `telegram_id` before processing. Unregistered users get a message asking for an invite code.

## 6. PDF Generation

Library: `pdf-lib` via `npm:pdf-lib` (works in Deno).  
Font: Helvetica (standard, no bundling needed). Assignment content is English-only so no Cyrillic support required.  
Filename: parsed from first line of assignment — `A2_Food_and_Restaurants.pdf`.

## 7. What Does NOT Change

- Claude prompt for assignment generation (identical to current `bot.py`)
- Claude prompt for editing assignments
- Assignment structure (8 tasks + metadata first line)
- Telegram bot identity (same token, same username)
- Telegram message splitting logic (>4096 chars → two messages)

## 8. Out of Scope

- User-facing analytics or usage stats
- Multiple similar assignments shown (only top-1 match shown)
- Assignment expiry / cache eviction
- Payment / subscription logic
