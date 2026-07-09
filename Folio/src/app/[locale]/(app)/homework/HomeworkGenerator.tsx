"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { generateHomework, saveTemplate } from "@/lib/homework/actions";
import { MODULE_TYPES, LEVELS, AGE_GROUPS, type HomeworkInput } from "@/lib/homework/schema";

interface Labels {
  type: string; topic: string; level: string; age: string; verb: string;
  generate: string; generating: string; result: string; saveTemplate: string;
  saved: string; saveError: string;
  typeReading: string; typeVocabulary: string; typeTranslationTexts: string;
  typeTranslationSentences: string; typeVerb: string; typeWarmup: string;
  typeReadingDesc: string; typeVocabularyDesc: string; typeTranslationTextsDesc: string;
  typeTranslationSentencesDesc: string; typeVerbDesc: string; typeWarmupDesc: string;
  ageTeen: string; ageYoung: string; ageAdult: string;
}

export function HomeworkGenerator({ labels }: { labels: Labels }) {
  const router = useRouter();
  const typeLabels: Record<(typeof MODULE_TYPES)[number], string> = {
    READING_MODULE: labels.typeReading,
    VOCABULARY_MODULE: labels.typeVocabulary,
    TRANSLATION_TEXTS: labels.typeTranslationTexts,
    TRANSLATION_SENTENCES: labels.typeTranslationSentences,
    VERB_SENTENCES: labels.typeVerb,
    WARMUP_MODULE: labels.typeWarmup,
  };
  // What template each type produces — shown as a hover tooltip on the type button.
  const typeDescriptions: Record<(typeof MODULE_TYPES)[number], string> = {
    READING_MODULE: labels.typeReadingDesc,
    VOCABULARY_MODULE: labels.typeVocabularyDesc,
    TRANSLATION_TEXTS: labels.typeTranslationTextsDesc,
    TRANSLATION_SENTENCES: labels.typeTranslationSentencesDesc,
    VERB_SENTENCES: labels.typeVerbDesc,
    WARMUP_MODULE: labels.typeWarmupDesc,
  };
  const ages = [
    { v: "teen", label: labels.ageTeen },
    { v: "young_adult", label: labels.ageYoung },
    { v: "adult", label: labels.ageAdult },
  ];

  const [moduleType, setModuleType] = useState<(typeof MODULE_TYPES)[number]>("READING_MODULE");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("B1");
  const [ageGroup, setAgeGroup] = useState<(typeof AGE_GROUPS)[number]>("adult");
  const [verb, setVerb] = useState("");
  const [content, setContent] = useState("");
  // Snapshot of the input used for the previewed content, so save stores matching metadata
  // even if the user edits the fields afterwards.
  const [generatedInput, setGeneratedInput] = useState<HomeworkInput | null>(null);
  const [pending, setPending] = useState(false);

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }

  const selectCls = "rounded-xl border border-border bg-card px-3 py-2 text-sm";
  const chipCls = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
      active ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
    }`;
  // Topic is optional for the warm-up module; required for the rest.
  const topicRequired = moduleType !== "WARMUP_MODULE";

  async function onGenerate() {
    if (topicRequired && !topic.trim()) { toast.error(labels.saveError); return; }
    setPending(true);
    setContent("");
    try {
      const input = currentInput();
      const res = await generateHomework(input);
      if (res.ok) { setContent(res.content); setGeneratedInput(input); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function onSave() {
    if (!generatedInput) return;
    setPending(true);
    try {
      const res = await saveTemplate(generatedInput, content);
      if (res.ok) { toast.success(labels.saved); setContent(""); setGeneratedInput(null); setTopic(""); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <span id="hw-type-label" className="text-sm font-medium leading-none select-none">{labels.type}</span>
        <TooltipProvider delay={500}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="hw-type-label">
            {MODULE_TYPES.map((t) => (
              <Tooltip key={t}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-pressed={moduleType === t}
                      className={chipCls(moduleType === t)}
                      onClick={() => setModuleType(t)}
                    />
                  }
                >
                  {moduleType === t ? "✓ " : ""}{typeLabels[t]}
                </TooltipTrigger>
                <TooltipContent>{typeDescriptions[t]}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
        {/* Always-visible description of the selected type — reaches touch/keyboard/screen-reader users the hover tooltip can't. */}
        <p className="text-xs text-muted-foreground">{typeDescriptions[moduleType]}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-topic">{labels.topic}</Label>
          <Input id="hw-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-level">{labels.level}</Label>
          <select id="hw-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-age">{labels.age}</Label>
          <select id="hw-age" className={selectCls} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as (typeof AGE_GROUPS)[number])}>
            {ages.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </div>
        {moduleType === "VERB_SENTENCES" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="hw-verb">{labels.verb}</Label>
            <Input id="hw-verb" value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="must / have to" />
          </div>
        )}
      </div>

      <div>
        <Button onClick={onGenerate} disabled={pending || (topicRequired && !topic.trim())}>
          {pending && !content ? labels.generating : labels.generate}
        </Button>
      </div>

      {content && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">{labels.result}</span>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-4 font-sans text-sm">
            {content}
          </pre>
          <div>
            <Button onClick={onSave} disabled={pending}>{labels.saveTemplate}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
