import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudents } from "@/lib/students/queries";
import { StudentsTable } from "./StudentsTable";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const students = await listStudents(includeArchived);

  const t = await getTranslations("Students");
  const labels = {
    add: t("add"), empty: t("empty"), name: t("name"), email: t("email"),
    telegram: t("telegram"), rate: t("rate"), notes: t("notes"), created: t("created"),
    actions: t("actions"), edit: t("edit"), archive: t("archive"), restore: t("restore"),
    save: t("save"), cancel: t("cancel"), newStudent: t("newStudent"), editStudent: t("editStudent"),
    showArchived: t("showArchived"), showActive: t("showActive"), archivedBadge: t("archivedBadge"),
    saved: t("saved"), saveError: t("saveError"),
    archivedToast: t("archivedToast"), restoredToast: t("restoredToast"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <StudentsTable students={students} includeArchived={includeArchived} labels={labels} />
    </main>
  );
}
