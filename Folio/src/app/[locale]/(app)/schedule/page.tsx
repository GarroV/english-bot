import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listLessonsInRange } from "@/lib/lessons/queries";
import { listStudents } from "@/lib/students/queries";
import { mondayFromParam, weekRange } from "@/lib/lessons/week";
import { ScheduleBoard } from "./ScheduleBoard";
import { StudentsPanel } from "./StudentsPanel";

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
  // Load all students once (incl. archived for the panel's toggle); the board only
  // needs active ones for lesson creation.
  const [lessons, allStudents] = await Promise.all([
    listLessonsInRange(fromISO, toISO),
    listStudents(true),
  ]);
  const activeStudents = allStudents
    .filter((s) => s.archived_at == null)
    .map((s) => ({ id: s.id, name: s.name }));

  const t = await getTranslations("Schedule");
  const ts = await getTranslations("Students");
  const tj = await getTranslations("Journal");
  const labels = {
    today: t("today"), group: t("group"), noStudents: t("noStudents"),
    dialog: {
      newLesson: t("newLesson"), editLesson: t("editLesson"), datetime: t("datetime"),
      duration: t("duration"), location: t("location"), online: t("online"), offline: t("offline"),
      students: t("students"), notes: t("notes"), save: t("save"), cancel: t("cancel"),
      cancelLesson: t("cancelLesson"), complete: t("complete"),
      saved: t("saved"), saveError: t("saveError"), pickStudents: t("pickStudents"),
      journal: t("journal"),
    },
    journal: {
      title: tj("title"), topic: tj("topic"), level: tj("level"), levelNone: tj("levelNone"),
      comment: tj("comment"), progress: tj("progress"), save: tj("save"), cancel: tj("cancel"),
      loading: tj("loading"), loadError: tj("loadError"), saved: tj("saved"), saveError: tj("saveError"),
    },
  };
  const studentLabels = {
    title: ts("title"), add: ts("add"), empty: ts("empty"), name: ts("name"), email: ts("email"),
    telegram: ts("telegram"), rate: ts("rate"), notes: ts("notes"), edit: ts("edit"),
    archive: ts("archive"), restore: ts("restore"), save: ts("save"), cancel: ts("cancel"),
    newStudent: ts("newStudent"), editStudent: ts("editStudent"),
    showArchived: ts("showArchived"), showActive: ts("showActive"), archivedBadge: ts("archivedBadge"),
    saved: ts("saved"), saveError: ts("saveError"),
    archivedToast: ts("archivedToast"), restoredToast: ts("restoredToast"),
    cabinet: ts("cabinet"), cabinetCopied: ts("cabinetCopied"),
  };
  const studentJournalLabels = {
    historyTitle: tj("historyTitle"), historyEmpty: tj("historyEmpty"),
    progress: tj("progress"), loading: tj("loading"), loadError: tj("loadError"), close: tj("close"),
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 p-6 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="text-4xl font-bold">{t("title")}</h1>
        <ScheduleBoard
          weekStartISO={monday.toISOString()}
          lessons={lessons}
          students={activeStudents}
          labels={labels}
        />
      </div>
      <StudentsPanel students={allStudents} labels={studentLabels} journalLabels={studentJournalLabels} />
    </main>
  );
}
