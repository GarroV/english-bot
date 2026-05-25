-- Add module_type filter to match_assignments so cache lookup stays within the same module type
create or replace function match_assignments(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_module_type text default null
)
returns table (
  id           uuid,
  telegram_id  bigint,
  level        text,
  topic        text,
  age_group    text,
  module_type  text,
  request_text text,
  content      text,
  created_at   timestamptz
)
language sql stable
as $$
  select
    id, telegram_id, level, topic, age_group, module_type, request_text, content, created_at
  from eb_assignments
  where 1 - (embedding <=> query_embedding) > match_threshold
    and (filter_module_type is null or module_type = filter_module_type)
  order by embedding <=> query_embedding
  limit match_count;
$$;
