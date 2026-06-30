"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateHomework, saveTemplate, editHomework } from "@/lib/homework/actions";
import { MODULE_TYPES, LEVELS, AGE_GROUPS, type HomeworkInput } from "@/lib/homework/schema";

// Reuses the Homework namespace labels (form fields) + Dashboard labels (draft/proofread).
export interface GenerateFormLabels {
  type: string; topic: string; level: string; age: string; verb: string;
  generate: string; generating: string; saveTemplate: string; saved: string; saveError: string;
  typeReading: string; typeVocabulary: string; typeTranslationTexts: string;
  typeTranslationSentences: string; typeVerb: string;
  ageTeen: string; ageYoung: string; ageAdult: string;
}
export interface GenerateDashLabels {
  generateTitle: string; generateLead: string; draftTitle: string; onReview: string;
  fix: string; fixPlaceholder: string; applyFix: string; fixing: string; regenerate: string;
}

export function GeneratePanel({ form, dash }: { form: GenerateFormLabels; dash: GenerateDashLabels }) {
  const router = useRouter();
  const typeLabels: Record<(typeof MODULE_TYPES)[number], string> = {
    READING_MODULE: form.typeReading,
    VOCABULARY_MODULE: form.typeVocabulary,
    TRANSLATION_TEXTS: form.typeTranslationTexts,
    TRANSLATION_SENTENCES: form.typeTranslationSentences,
    VERB_SENTENCES: form.typeVerb,
  };
  const ages = [
    { v: "teen", label: form.ageTeen },
    { v: "young_adult", label: form.ageYoung },
    { v: "adult", label: form.ageAdult },
  ];

  const [moduleType, setModuleType] = useState<(typeof MODULE_TYPES)[number]>("READING_MODULE");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("B1");
  const [ageGroup, setAgeGroup] = useState<(typeof AGE_GROUPS)[number]>("adult");
  const [verb, setVerb] = useState("");
  const [content, setContent] = useState("");
  const [generatedInput, setGeneratedInput] = useState<HomeworkInput | null>(null);
  const [fixText, setFixText] = useState("");
  const [pending, setPending] = useState(false);

  const selectCls = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }

  async function onGenerate() {
    if (!topic.trim()) { toast.error(form.saveError); return; }
    setPending(true);
    setContent("");
    try {
      const input = currentInput();
      const res = await generateHomework(input);
      if (res.ok) { setContent(res.content); setGeneratedInput(input); }
      else toast.error(`${form.saveError}: ${res.error}`);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  async function onFix() {
    if (!fixText.trim()) return;
    setPending(true);
    try {
      const res = await editHomework(content, fixText.trim());
      if (res.ok) { setContent(res.content); setFixText(""); }
      else toast.error(`${form.saveError}: ${res.error}`);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  async function onSave() {
    if (!generatedInput) return;
    setPending(true);
    try {
      const res = await saveTemplate(generatedInput, content);
      if (res.ok) {
        toast.success(form.saved);
        setContent(""); setGeneratedInput(null); setTopic(""); setFixText("");
        router.refresh();
      } else toast.error(`${form.saveError}: ${res.error}`);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight">{dash.generateTitle}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{dash.generateLead}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="gp-type">{form.type}</Label>
          <select id="gp-type" className={selectCls} value={moduleType}
            onChange={(e) => setModuleType(e.target.value as (typeof MODULE_TYPES)[number])}>
            {MODULE_TYPES.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gp-topic">{form.topic}</Label>
          <Input id="gp-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gp-level">{form.level}</Label>
          <select id="gp-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gp-age">{form.age}</Label>
          <select id="gp-age" className={selectCls} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as (typeof AGE_GROUPS)[number])}>
            {ages.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </div>
        {moduleType === "VERB_SENTENCES" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="gp-verb">{form.verb}</Label>
            <Input id="gp-verb" value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="must / have to" />
          </div>
        )}
      </div>

      <div>
        <Button onClick={onGenerate} disabled={pending || !topic.trim()}>
          {pending && !content ? form.generating : form.generate}
        </Button>
      </div>

      {content && (
        <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">{dash.draftTitle}</span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-500">{dash.onReview}</span>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-sans text-sm">{content}</pre>
          <div className="flex flex-col gap-2 border-t border-dashed border-border px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex-none text-xs font-bold text-[color:var(--brand-coral)]">{dash.fix}:</span>
            <Input value={fixText} onChange={(e) => setFixText(e.target.value)} placeholder={dash.fixPlaceholder}
              onKeyDown={(e) => { if (e.key === "Enter") onFix(); }} />
            <Button variant="outline" size="sm" onClick={onFix} disabled={pending || !fixText.trim()} className="flex-none">
              {pending && fixText ? dash.fixing : dash.applyFix}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <Button size="sm" onClick={onSave} disabled={pending}>{form.saveTemplate}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setContent(""); setGeneratedInput(null); setFixText(""); }} disabled={pending}>
              {dash.regenerate}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
