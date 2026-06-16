import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSuperAdmin } from "@/lib/admin/guard";
import { listSignupInvites, listWorkspacesOverview } from "@/lib/admin/queries";
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

  const [invites, workspaces] = await Promise.all([listSignupInvites(), listWorkspacesOverview()]);
  // Origin for building invite links — taken from the request (no client window access).
  const h = await headers();
  const host = h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const t = await getTranslations("Admin");
  const labels = {
    invitesTitle: t("invitesTitle"), note: t("note"), ttlDays: t("ttlDays"), create: t("create"),
    created: t("created"), copy: t("copy"), copied: t("copied"), link: t("link"),
    statusPending: t("statusPending"), statusUsed: t("statusUsed"), expires: t("expires"),
    usedBy: t("usedBy"), revoke: t("revoke"), revoked: t("revoked"), noInvites: t("noInvites"),
    workspacesTitle: t("workspacesTitle"), wsName: t("wsName"), tutor: t("tutor"),
    students: t("students"), lessons: t("lessons"), createdAt: t("createdAt"),
    noWorkspaces: t("noWorkspaces"), saveError: t("saveError"),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <AdminPanel invites={invites} workspaces={workspaces} labels={labels} locale={locale} origin={origin} />
    </main>
  );
}
