"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { generateHomework, saveTemplate, editHomework } from "@/lib/homework/actions";
import { MODULE_TYPES, LEVELS, AGE_GROUPS, type HomeworkInput } from "@/lib/homework/schema";

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

type ModuleT = (typeof MODULE_TYPES)[number];
type LevelT = (typeof LEVELS)[number];
type AgeT = (typeof AGE_GROUPS)[number];

export function GeneratePanel({ form, dash }: { form: GenerateFormLabels; dash: GenerateDashLabels }) {
  const router = useRouter();
  const typeLabels: Record<ModuleT, string> = {
    READING_MODULE: form.typeReading,
    VOCABULARY_MODULE: form.typeVocabulary,
    TRANSLATION_TEXTS: form.typeTranslationTexts,
    TRANSLATION_SENTENCES: form.typeTranslationSentences,
    VERB_SENTENCES: form.typeVerb,
  };
  const ageLabels: Record<AgeT, string> = { teen: form.ageTeen, young_adult: form.ageYoung, adult: form.ageAdult };

  const [moduleType, setModuleType] = useState<ModuleT>("READING_MODULE");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<LevelT>("B1");
  const [ageGroup, setAgeGroup] = useState<AgeT>("adult");
  const [verb, setVerb] = useState("");
  const [content, setContent] = useState("");
  const [generatedInput, setGeneratedInput] = useState<HomeworkInput | null>(null);
  const [fixText, setFixText] = useState("");
  const [pending, setPending] = useState(false);

  const showVerb = moduleType === "VERB_SENTENCES";

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }

  async function onGenerate() {
    if (!topic.trim() || (showVerb && !verb.trim())) { toast.error(form.saveError); return; }
    setPending(true); setContent("");
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
      if (res.ok) { toast.success(form.saved); setContent(""); setGeneratedInput(null); setTopic(""); setFixText(""); router.refresh(); }
      else toast.error(`${form.saveError}: ${res.error}`);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
    }`;

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border border-border p-6 shadow-sm"
      style={{ background: "radial-gradient(130% 130% at 0% 0%, color-mix(in oklab, var(--primary) 13%, transparent), transparent 52%), var(--card)" }}
    >
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight">{dash.generateTitle}</h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{dash.generateLead}</p>
      </div>

      {/* ask box: topic + generate */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 p-2 pl-4 focus-within:border-primary">
        <Sparkles className="h-5 w-5 flex-none text-primary" />
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !pending) onGenerate(); }}
          placeholder={`${form.topic}: B2, бизнес-лексика, взрослый…`}
          aria-label={form.topic}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending || !topic.trim() || (showVerb && !verb.trim())}
          className="flex-none rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {pending && !content ? form.generating : form.generate}
        </button>
      </div>

      {/* type chips */}
      <div className="flex flex-wrap gap-2">
        {MODULE_TYPES.map((t) => (
          <button key={t} type="button" className={chip(moduleType === t)} onClick={() => setModuleType(t)}>
            {moduleType === t ? "✓ " : ""}{typeLabels[t]}
          </button>
        ))}
      </div>

      {/* level + age + teacher chips */}
      <div className="flex flex-wrap items-center gap-2">
        {LEVELS.map((l) => (
          <button key={l} type="button" className={chip(level === l)} onClick={() => setLevel(l)}>{l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {AGE_GROUPS.map((a) => (
          <button key={a} type="button" className={chip(ageGroup === a)} onClick={() => setAgeGroup(a)}>{ageLabels[a]}</button>
        ))}
        {showVerb && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <input
              value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="must / have to" aria-label={form.verb}
              className="w-40 rounded-full border border-border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary"
            />
          </>
        )}
      </div>

      {/* draft + proofread */}
      {content && (
        <div className="overflow-hidden rounded-xl border border-border bg-card/70">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {dash.draftTitle} · {typeLabels[moduleType]} · {level}
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-500">{dash.onReview}</span>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed">{content}</pre>
          <div className="flex flex-col gap-2 border-t border-dashed border-border px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex-none text-xs font-bold text-[color:var(--brand-coral)]">✎ {dash.fix}:</span>
            <input
              value={fixText} onChange={(e) => setFixText(e.target.value)} placeholder={dash.fixPlaceholder}
              onKeyDown={(e) => { if (e.key === "Enter" && !pending) onFix(); }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-[color:var(--brand-coral)]"
            />
            <button type="button" onClick={onFix} disabled={pending || !fixText.trim()}
              className="flex-none rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-50">
              {pending && fixText ? dash.fixing : dash.applyFix}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <button type="button" onClick={onSave} disabled={pending}
              className="rounded-lg bg-primary/12 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
              💾 {form.saveTemplate}
            </button>
            <button type="button" onClick={() => { setContent(""); setGeneratedInput(null); setFixText(""); }} disabled={pending}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-50">
              🔄 {dash.regenerate}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
