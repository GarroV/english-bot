import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/homework/queries";
import { HomeworkGenerator } from "./HomeworkGenerator";

const TYPE_KEY: Record<string, string> = {
  READING_MODULE: "typeReading",
  VOCABULARY_MODULE: "typeVocabulary",
  TRANSLATION_TEXTS: "typeTranslationTexts",
  TRANSLATION_SENTENCES: "typeTranslationSentences",
  VERB_SENTENCES: "typeVerb",
};

export default async function HomeworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const templates = await listTemplates();
  const t = await getTranslations("Homework");
  const labels = {
    type: t("type"), topic: t("topic"), level: t("level"), age: t("age"), verb: t("verb"),
    generate: t("generate"), generating: t("generating"), result: t("result"),
    saveTemplate: t("saveTemplate"), saved: t("saved"), saveError: t("saveError"),
    typeReading: t("typeReading"), typeVocabulary: t("typeVocabulary"),
    typeTranslationTexts: t("typeTranslationTexts"), typeTranslationSentences: t("typeTranslationSentences"),
    typeVerb: t("typeVerb"), ageTeen: t("ageTeen"), ageYoung: t("ageYoung"), ageAdult: t("ageAdult"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <HomeworkGenerator labels={labels} />

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t("templates")}</h2>
        {templates.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{tpl.topic}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(TYPE_KEY[tpl.module_type] ?? "typeReading")}{tpl.level ? ` · ${tpl.level}` : ""} · {new Date(tpl.created_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
