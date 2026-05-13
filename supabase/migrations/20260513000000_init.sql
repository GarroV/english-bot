-- Enable pgvector
create extension if not exists vector;

-- Users (white list + profiles)
create table eb_users (
  telegram_id  bigint primary key,
  username     text,
  name         text,
  invited_by   bigint references eb_users(telegram_id),
  created_at   timestamptz default now()
);

-- Conversation state
-- No FK to eb_users: unregistered users need REGISTERING state too
create table eb_sessions (
  telegram_id  bigint primary key,
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

-- Invite codes (one-time use)
create table eb_invitations (
  code        text primary key,
  created_by  bigint references eb_users(telegram_id),
  used_by     bigint references eb_users(telegram_id),
  used_at     timestamptz,
  created_at  timestamptz default now()
);

-- Similarity search function
create or replace function match_assignments(
  query_embedding vector(512),
  match_threshold float,
  match_count int
)
returns table (
  id           uuid,
  telegram_id  bigint,
  level        text,
  topic        text,
  age_group    text,
  request_text text,
  content      text,
  created_at   timestamptz
)
language sql stable
as $$
  select
    id, telegram_id, level, topic, age_group, request_text, content, created_at
  from eb_assignments
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Index for vector search performance (tune lists= when row count grows)
create index on eb_assignments using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);
