import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSuperAdmin } from "@/lib/admin/guard";
import { listSignupInvites, listWorkspacesOverview, listFeedback } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format/date";
import { AdminPanel } from "./AdminPanel";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const sa = await getSuperAdmin();
  if (!sa) {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const [invites, workspaces, feedback] = await Promise.all([
    listSignupInvites(), listWorkspacesOverview(), listFeedback(),
  ]);
  // Origin for building invite links — taken from the request (no client window access).
  const h = await headers();
  const host = h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const t = await getTranslations("Admin");
  const labels = {
    tutorsTitle: t("tutorsTitle"), pendingTitle: t("pendingTitle"),
    note: t("note"), ttlDays: t("ttlDays"), create: t("create"),
    created: t("created"), copy: t("copy"), copied: t("copied"), link: t("link"),
    expires: t("expires"), revoke: t("revoke"), revoked: t("revoked"),
    wsName: t("wsName"), tutor: t("tutor"),
    students: t("students"), lessons: t("lessons"), createdAt: t("createdAt"),
    noWorkspaces: t("noWorkspaces"), saveError: t("saveError"),
    accessRevoke: t("accessRevoke"), accessRestore: t("accessRestore"),
    accessRevokedBadge: t("accessRevokedBadge"), accessConfirmRevoke: t.raw("accessConfirmRevoke"),
    accessRevokedToast: t("accessRevokedToast"), accessRestoredToast: t("accessRestoredToast"),
    statsToggle: t("statsToggle"), statsLessonsMonth: t("statsLessonsMonth"),
    statsLessonsLine: t.raw("statsLessonsLine"), statsGenerations: t("statsGenerations"),
    statsCountLine: t.raw("statsCountLine"), statsTemplates: t("statsTemplates"),
    statsLastActivity: t("statsLastActivity"), statsNever: t("statsNever"),
    quotaTitle: t("quotaTitle"), quotaUnlimited: t("quotaUnlimited"), quotaLeftLine: t.raw("quotaLeftLine"),
    quotaAddBtn: t("quotaAddBtn"), quotaAddPrompt: t("quotaAddPrompt"), quotaUnlimitedBtn: t("quotaUnlimitedBtn"),
    quotaConfirmUnlimited: t.raw("quotaConfirmUnlimited"), quotaSaved: t("quotaSaved"),
  };

  // Категории отзывов переиспользуют лейблы диалога фидбека (🐞/💡/💬).
  const tf = await getTranslations("Feedback");
  const catLabel: Record<string, string> = {
    bug: tf("cat_bug"), idea: tf("cat_idea"), other: tf("cat_other"),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <AdminPanel invites={invites} workspaces={workspaces} labels={labels} locale={locale} origin={origin} />

      {/* Отзывы (#67): копия того, что уходит в Telegram — чтобы ничего не терялось в ленте. */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-2xl font-bold">{t("feedbackTitle")}</h2>
        {feedback.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{t("feedbackEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                    {catLabel[f.category] ?? f.category}
                  </span>
                  <span>{f.user_name ?? "—"}{f.workspace_name ? ` · ${f.workspace_name}` : ""}</span>
                  <span className="ml-auto">{formatDate(f.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
