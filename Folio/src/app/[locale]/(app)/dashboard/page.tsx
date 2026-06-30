import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listLessonsInRange } from "@/lib/lessons/queries";
import { listBalances } from "@/lib/billing/queries";
import { listAssignments } from "@/lib/homework/queries";
import { listStudents } from "@/lib/students/queries";
import { todayLessons, debtors, homeworkBuckets, mskDateString } from "@/lib/dashboard/derive";
import { DashboardBento } from "./DashboardBento";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const now = new Date();
  const nowISO = now.toISOString();
  // ±24h UTC window guarantees coverage of the full MSK day; derive filters to today.
  const fromISO = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const toISO = new Date(now.getTime() + 24 * 3_600_000).toISOString();

  const [lessonsRaw, balances, assignments, allStudents] = await Promise.all([
    listLessonsInRange(fromISO, toISO),
    listBalances(),
    listAssignments(),
    listStudents(true),
  ]);

  const today = todayLessons(lessonsRaw, nowISO);
  const debt = debtors(balances);
  const hw = homeworkBuckets(assignments, mskDateString(nowISO));
  const students = allStudents.filter((s) => s.archived_at == null).map((s) => ({ id: s.id, name: s.name }));

  const d = await getTranslations("Dashboard");
  const h = await getTranslations("Homework");
  const b = await getTranslations("Billing");

  return (
    <DashboardBento
      title={d("title")}
      nowISO={nowISO}
      todayLessons={today}
      debtors={debt}
      hw={hw}
      students={students}
      todayLabels={{
        todayLessons: d("todayLessons"),
        openSchedule: d("openSchedule"),
        noLessonsToday: d("noLessonsToday"),
        now: d("now"),
        group: d("group"),
      }}
      genForm={{
        type: h("type"), topic: h("topic"), level: h("level"), age: h("age"), verb: h("verb"),
        generate: h("generate"), generating: h("generating"), saveTemplate: h("saveTemplate"),
        saved: h("saved"), saveError: h("saveError"),
        typeReading: h("typeReading"), typeVocabulary: h("typeVocabulary"),
        typeTranslationTexts: h("typeTranslationTexts"), typeTranslationSentences: h("typeTranslationSentences"),
        typeVerb: h("typeVerb"), ageTeen: h("ageTeen"), ageYoung: h("ageYoung"), ageAdult: h("ageAdult"),
      }}
      genDash={{
        generateTitle: d("generateTitle"), generateLead: d("generateLead"),
        draftTitle: d("draftTitle"), onReview: d("onReview"),
        fix: d("fix"), fixPlaceholder: d("fixPlaceholder"), applyFix: d("applyFix"),
        fixing: d("fixing"), regenerate: d("regenerate"),
      }}
      headerLabels={{
        history: d("history"), manageStudents: d("manageStudents"),
        addLesson: d("addLesson"), addPayment: d("addPayment"),
      }}
      paymentLabels={{
        title: b("recordPayment"), student: b("student"), amount: b("amount"), note: b("note"),
        save: b("save"), cancel: b("cancel"), saved: b("saved"), error: b("saveError"),
        pickStudent: d("pickStudent"),
      }}
      themeLabels={{ system: d("themeSystem"), light: d("themeLight"), dark: d("themeDark") }}
      hwLabels={{ homework: d("homework"), onCheck: d("onCheck"), overdue: d("overdue"), noHomework: d("noHomework") }}
      debtLabels={{ debts: d("debts"), toReceive: d("toReceive"), noDebts: d("noDebts") }}
    />
  );
}
