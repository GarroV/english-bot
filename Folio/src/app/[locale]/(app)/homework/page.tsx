import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/homework/queries";
import { listActiveStudents } from "@/lib/lessons/queries";
import { HomeworkGenerator } from "./HomeworkGenerator";
import { TemplatesList } from "./TemplatesList";
// ВРЕМЕННО (2026-07): раздел «Проверка заданий» (AssignmentsList) скрыт вместе с онлайн-сдачей ДЗ.
// AssignmentsList.tsx и listAssignments() целы; восстановить — из git-истории коммита скрытия.

const TYPE_KEY: Record<string, string> = {
  READING_MODULE: "typeReading",
  VOCABULARY_MODULE: "typeVocabulary",
  TRANSLATION_TEXTS: "typeTranslationTexts",
  TRANSLATION_SENTENCES: "typeTranslationSentences",
  VERB_SENTENCES: "typeVerb",
  WARMUP_MODULE: "typeWarmup",
};

export default async function HomeworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const [templates, students] = await Promise.all([
    listTemplates(),
    listActiveStudents(),
  ]);

  const t = await getTranslations("Homework");
  // Plain serializable maps — functions cannot be passed to Client Components.
  const typeLabels: Record<string, string> = Object.fromEntries(
    Object.entries(TYPE_KEY).map(([type, key]) => [type, t(key)]),
  );

  const genLabels = {
    type: t("type"), topic: t("topic"), level: t("level"), age: t("age"), verb: t("verb"),
    generate: t("generate"), generating: t("generating"), result: t("result"),
    saveTemplate: t("saveTemplate"), saved: t("saved"), saveError: t("saveError"),
    typeReading: t("typeReading"), typeVocabulary: t("typeVocabulary"),
    typeTranslationTexts: t("typeTranslationTexts"), typeTranslationSentences: t("typeTranslationSentences"),
    typeVerb: t("typeVerb"), typeWarmup: t("typeWarmup"),
    typeReadingDesc: t("typeReadingDesc"), typeVocabularyDesc: t("typeVocabularyDesc"),
    typeTranslationTextsDesc: t("typeTranslationTextsDesc"), typeTranslationSentencesDesc: t("typeTranslationSentencesDesc"),
    typeVerbDesc: t("typeVerbDesc"), typeWarmupDesc: t("typeWarmupDesc"),
    ageTeen: t("ageTeen"), ageYoung: t("ageYoung"), ageAdult: t("ageAdult"),
  };
  const tplLabels = {
    empty: t("empty"), templates: t("templates"), view: t("view"), hide: t("hide"),
    copy: t("copy"), copied: t("copied"), assign: t("assign"), assignTitle: t("assignTitle"),
    students: t("students"), dueDate: t("dueDate"), confirmAssign: t("confirmAssign"),
    cancel: t("cancel"), assigned: t("assigned"), pickStudents: t("pickStudents"),
    saveError: t("saveError"), typeLabels,
  };
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <HomeworkGenerator labels={genLabels} />
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t("templates")}</h2>
        <TemplatesList templates={templates} students={students} labels={tplLabels} />
      </div>
      {/* ВРЕМЕННО (2026-07): <AssignmentsList> — раздел проверки сданных ДЗ — скрыт. */}
    </main>
  );
}
