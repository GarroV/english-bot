import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listLessonsInRange } from "@/lib/lessons/queries";
import { listBalances } from "@/lib/billing/queries";
import { listStudents } from "@/lib/students/queries";
import { todayLessons, debtors } from "@/lib/dashboard/derive";
import { DashboardBento } from "./DashboardBento";
// ВРЕМЕННО (2026-07): homework-блок дашборда скрыт вместе с онлайн-сдачей ДЗ —
// listAssignments()/homeworkBuckets() больше не вызываются здесь; восстановить из git-истории.

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

  const [lessonsRaw, balances, allStudents] = await Promise.all([
    listLessonsInRange(fromISO, toISO),
    listBalances(),
    listStudents(true),
  ]);

  const today = todayLessons(lessonsRaw, nowISO);
  const debt = debtors(balances);
  const students = allStudents.filter((s) => s.archived_at == null).map((s) => ({ id: s.id, name: s.name }));

  const d = await getTranslations("Dashboard");
  const h = await getTranslations("Homework");

  return (
    <DashboardBento
      nowISO={nowISO}
      todayLessons={today}
      debtors={debt}
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
        fixing: d("fixing"), regenerate: d("regenerate"), assign: d("assign"),
        downloadPdf: d("downloadPdf"),
      }}
      genAssign={{
        title: h("assignTitle"), students: h("students"), dueDate: h("dueDate"),
        confirm: h("confirmAssign"), cancel: h("cancel"), assigned: h("assigned"),
        pickStudents: h("pickStudents"), error: h("saveError"),
      }}
      debtLabels={{ debts: d("debts"), toReceive: d("toReceive"), noDebts: d("noDebts") }}
    />
  );
}
