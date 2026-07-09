// Квота генераций воркспейса (#75) — единый канон расчёта для бота и folio-generate.
// С 2026-07-09 квота МЕСЯЧНАЯ: granted — folio_workspaces.generation_quota = лимит в месяц
// (NULL = безлимит → возвращаем null); used — module-вызовы eb_llm_usage ЗА ТЕКУЩИЙ МЕСЯЦ
// по Москве, по обоим источникам (бот ref_id=telegram_id владельца, folio ref_id=workspace_id).
// «Обнуление» неиспользованного — автоматическое: 1-го числа окно месяца новое, счётчик с нуля.
// Хранимых счётчиков нет — всё считается на чтении, гонки не критичны (мягкий лимит).
// deno-lint-ignore-file no-explicit-any
export interface GenerationBudget {
  granted: number;
  used: number;
}

const MSK_OFFSET_MS = 3 * 3_600_000; // МСК = UTC+3, без DST — как весь продукт

// UTC-момент начала текущего месяца по Москве (граница окна квоты).
export function mskMonthStartISO(nowMs = Date.now()): string {
  const d = new Date(nowMs + MSK_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - MSK_OFFSET_MS).toISOString();
}

// `supabase` — service-role клиент вызывающей функции (любой @supabase/supabase-js v2).
export async function getWorkspaceGenerationBudget(
  supabase: any,
  workspaceId: string,
): Promise<GenerationBudget | null> {
  const { data: ws, error } = await supabase
    .from("folio_workspaces")
    .select("generation_quota, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`quota read failed: ${error.message}`);
  const granted = ws?.generation_quota == null ? null : Number(ws.generation_quota);
  if (granted == null) return null;

  let ownerTelegram: number | null = null;
  if (ws?.owner_id) {
    const { data: owner } = await supabase
      .from("folio_users")
      .select("telegram_id")
      .eq("id", ws.owner_id)
      .maybeSingle();
    ownerTelegram = owner?.telegram_id == null ? null : Number(owner.telegram_id);
  }

  const filter = ownerTelegram != null
    ? `and(source.eq.bot,ref_id.eq.${ownerTelegram}),and(source.eq.folio,ref_id.eq.${workspaceId})`
    : `and(source.eq.folio,ref_id.eq.${workspaceId})`;
  const { count, error: cntErr } = await supabase
    .from("eb_llm_usage")
    .select("*", { count: "exact", head: true })
    .eq("action", "module")
    .gte("created_at", mskMonthStartISO())
    .or(filter);
  if (cntErr) throw new Error(`quota usage count failed: ${cntErr.message}`);
  return { granted, used: count ?? 0 };
}
