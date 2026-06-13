import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listLessonsInRange, listActiveStudents } from "@/lib/lessons/queries";
import { mondayFromParam, weekRange } from "@/lib/lessons/week";
import { ScheduleBoard } from "./ScheduleBoard";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const { week } = await searchParams;
  const monday = mondayFromParam(week);
  const { fromISO, toISO } = weekRange(monday);
  const [lessons, students] = await Promise.all([
    listLessonsInRange(fromISO, toISO),
    listActiveStudents(),
  ]);

  const t = await getTranslations("Schedule");
  const labels = {
    today: t("today"), group: t("group"), noStudents: t("noStudents"),
    dialog: {
      newLesson: t("newLesson"), editLesson: t("editLesson"), datetime: t("datetime"),
      duration: t("duration"), location: t("location"), online: t("online"), offline: t("offline"),
      students: t("students"), notes: t("notes"), save: t("save"), cancel: t("cancel"),
      cancelLesson: t("cancelLesson"), complete: t("complete"),
      saved: t("saved"), saveError: t("saveError"), pickStudents: t("pickStudents"),
    },
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <ScheduleBoard
        weekStartISO={monday.toISOString()}
        lessons={lessons}
        students={students}
        labels={labels}
      />
    </main>
  );
}
