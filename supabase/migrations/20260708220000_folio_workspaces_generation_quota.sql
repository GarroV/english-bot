-- Квота генераций на воркспейс (#75). NULL = безлимит. Остаток считается на чтении:
-- generation_quota − count(eb_llm_usage WHERE action='module' AND (бот: ref_id=telegram_id владельца |
-- folio: ref_id=workspace_id)) — канон расчёта в supabase/functions/_shared/quota.ts.
-- Additive ADD COLUMN — безопасно применять сразу.
alter table folio_workspaces add column if not exists generation_quota int;
comment on column folio_workspaces.generation_quota is 'Лимит module-генераций (#75); NULL = безлимит; used считается из eb_llm_usage';
