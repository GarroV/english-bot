import { createAdminClient } from "@/lib/supabase/admin";
import { mskMonthKey, monthRangeUtc } from "@/lib/billing/summary";

// Server-only (NOT "use server"): cross-workspace reads via the service-role admin client.
// Only ever called from the /admin page, which gates on getSuperAdmin() first.

export interface SignupInviteRow {
  id: string;
  token: string;
  note: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  used_by_name: string | null;
}

export async function listSignupInvites(): Promise<SignupInviteRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folio_signup_invites")
    .select(
      "id, token, note, status, expires_at, created_at, used_at, used_user:folio_users!folio_signup_invites_used_by_fkey(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listSignupInvites failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const u = Array.isArray(r.used_user) ? r.used_user[0] : r.used_user;
    return {
      id: r.id as string,
      token: r.token as string,
      note: (r.note as string | null) ?? null,
      status: r.status as string,
      expires_at: r.expires_at as string,
      created_at: r.created_at as string,
      used_at: (r.used_at as string | null) ?? null,
      used_by_name: (u?.name as string | undefined) ?? null,
    };
  });
}

// Статистика воркспейса для раскрываемой строки админки (#77): текущий месяц по Москве + тоталы.
export interface WorkspaceStats {
  monthLessonsDone: number;
  monthLessonsCancelled: number;
  monthLessonsUpcoming: number;
  monthGenerations: number;
  totalGenerations: number;
  monthTemplates: number;
  totalTemplates: number;
  lastActivityAt: string | null; // max(прошедшее занятие, генерация, создание задания)
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string | null;
  tutor_name: string | null;
  tutor_telegram: number | null;
  tutor_disabled: boolean;
  students: number;
  lessons: number;
  stats: WorkspaceStats;
}

// Фильтр eb_llm_usage по репетитору: бот пишет ref_id=telegram_id, folio-generate (когда начнёт
// репортить) — ref_id=workspace_id. Учитываем оба источника сразу.
function usageOrFilter(workspaceId: string, telegramId: number | null): string {
  const folio = `and(source.eq.folio,ref_id.eq.${workspaceId})`;
  return telegramId != null ? `and(source.eq.bot,ref_id.eq.${telegramId}),${folio}` : folio;
}

export async function listWorkspacesOverview(): Promise<WorkspaceOverview[]> {
  const admin = createAdminClient();
  const { data: ws, error } = await admin
    .from("folio_workspaces")
    .select("id, name, created_at, owner_id")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listWorkspacesOverview failed: ${error.message}`);

  const nowISO = new Date().toISOString();
  const { fromISO, toISO } = monthRangeUtc(mskMonthKey(nowISO));
  const nowMs = new Date(nowISO).getTime();

  // N+1 is fine here — Folio has single-digit workspaces; this surface is super-admin-only.
  return Promise.all(
    (ws ?? []).map(async (w) => {
      const owner = w.owner_id
        ? (await admin.from("folio_users").select("name, telegram_id, disabled_at").eq("id", w.owner_id).maybeSingle()).data
        : null;
      const telegramId = (owner?.telegram_id as number | null) ?? null;
      const usageOr = usageOrFilter(w.id as string, telegramId);

      const [students, lessons, monthLessons, lastPastLesson, monthGen, totalGen, lastGen, monthTpl, totalTpl, lastTpl] = await Promise.all([
        admin.from("folio_students").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).is("archived_at", null).then((r) => r.count ?? 0),
        admin.from("folio_lessons").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).then((r) => r.count ?? 0),
        admin.from("folio_lessons").select("scheduled_at, status").eq("workspace_id", w.id).gte("scheduled_at", fromISO).lt("scheduled_at", toISO).then((r) => r.data ?? []),
        admin.from("folio_lessons").select("scheduled_at").eq("workspace_id", w.id).lte("scheduled_at", nowISO).order("scheduled_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.scheduled_at ?? null),
        admin.from("eb_llm_usage").select("*", { count: "exact", head: true }).or(usageOr).gte("created_at", fromISO).lt("created_at", toISO).then((r) => r.count ?? 0),
        admin.from("eb_llm_usage").select("*", { count: "exact", head: true }).or(usageOr).then((r) => r.count ?? 0),
        admin.from("eb_llm_usage").select("created_at").or(usageOr).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at ?? null),
        admin.from("folio_homework_templates").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).gte("created_at", fromISO).lt("created_at", toISO).then((r) => r.count ?? 0),
        admin.from("folio_homework_templates").select("*", { count: "exact", head: true }).eq("workspace_id", w.id).then((r) => r.count ?? 0),
        admin.from("folio_homework_templates").select("created_at").eq("workspace_id", w.id).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data?.created_at ?? null),
      ]);

      let done = 0, cancelled = 0, upcoming = 0;
      for (const l of monthLessons as { scheduled_at: string; status: string }[]) {
        if (l.status === "completed") done++;
        else if (l.status === "cancelled") cancelled++;
        else if (new Date(l.scheduled_at).getTime() > nowMs) upcoming++;
      }
      const activityCandidates = [lastPastLesson, lastGen, lastTpl].filter((x): x is string => x != null);
      const lastActivityAt = activityCandidates.length
        ? activityCandidates.reduce((a, b) => (new Date(a).getTime() > new Date(b).getTime() ? a : b))
        : null;

      return {
        id: w.id as string,
        name: w.name as string,
        created_at: w.created_at as string,
        owner_user_id: (w.owner_id as string | null) ?? null,
        tutor_name: (owner?.name as string | undefined) ?? null,
        tutor_telegram: telegramId,
        tutor_disabled: (owner?.disabled_at ?? null) != null,
        students,
        lessons,
        stats: {
          monthLessonsDone: done,
          monthLessonsCancelled: cancelled,
          monthLessonsUpcoming: upcoming,
          monthGenerations: monthGen,
          totalGenerations: totalGen,
          monthTemplates: monthTpl,
          totalTemplates: totalTpl,
          lastActivityAt,
        },
      };
    }),
  );
}
