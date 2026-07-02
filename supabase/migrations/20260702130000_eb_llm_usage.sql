-- LLM usage metering (#23 Фаза 1). One row per Anthropic call, written by service-role (bot).
-- RLS enabled with no policies → only service-role can read/write (Folio admin readout, if added
-- later, uses the admin/service client). Additive ADD TABLE — safe to apply immediately.
create table if not exists eb_llm_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,             -- 'bot' | 'folio'
  ref_id text not null,             -- telegram_id (bot) / workspace_id (folio)
  action text not null,             -- 'module' | 'teacher_guide' | 'edit'
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_creation_input_tokens int not null default 0,
  cache_read_input_tokens int not null default 0
);
create index if not exists eb_llm_usage_created_at_idx on eb_llm_usage (created_at);
create index if not exists eb_llm_usage_ref_created_idx on eb_llm_usage (ref_id, created_at);
alter table eb_llm_usage enable row level security;
