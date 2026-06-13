"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateHomework, saveTemplate } from "@/lib/homework/actions";
import { MODULE_TYPES, type HomeworkInput } from "@/lib/homework/schema";

interface Labels {
  type: string; topic: string; level: string; age: string; verb: string;
  generate: string; generating: string; result: string; saveTemplate: string;
  saved: string; saveError: string;
  typeReading: string; typeVocabulary: string; typeTranslationTexts: string;
  typeTranslationSentences: string; typeVerb: string;
  ageTeen: string; ageYoung: string; ageAdult: string;
}

const LEVELS = ["A2", "B1", "B2", "C1", "C2"];

export function HomeworkGenerator({ labels }: { labels: Labels }) {
  const router = useRouter();
  const typeLabels: Record<(typeof MODULE_TYPES)[number], string> = {
    READING_MODULE: labels.typeReading,
    VOCABULARY_MODULE: labels.typeVocabulary,
    TRANSLATION_TEXTS: labels.typeTranslationTexts,
    TRANSLATION_SENTENCES: labels.typeTranslationSentences,
    VERB_SENTENCES: labels.typeVerb,
  };
  const ages = [
    { v: "teen", label: labels.ageTeen },
    { v: "young_adult", label: labels.ageYoung },
    { v: "adult", label: labels.ageAdult },
  ];

  const [moduleType, setModuleType] = useState<(typeof MODULE_TYPES)[number]>("READING_MODULE");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B1");
  const [ageGroup, setAgeGroup] = useState("adult");
  const [verb, setVerb] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }

  const selectCls = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  async function onGenerate() {
    if (!topic.trim()) { toast.error(labels.saveError); return; }
    setPending(true);
    setContent("");
    try {
      const res = await generateHomework(currentInput());
      if (res.ok) setContent(res.content);
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function onSave() {
    setPending(true);
    try {
      const res = await saveTemplate(currentInput(), content);
      if (res.ok) { toast.success(labels.saved); setContent(""); setTopic(""); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-type">{labels.type}</Label>
          <select id="hw-type" className={selectCls} value={moduleType}
            onChange={(e) => setModuleType(e.target.value as (typeof MODULE_TYPES)[number])}>
            {MODULE_TYPES.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-topic">{labels.topic}</Label>
          <Input id="hw-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-level">{labels.level}</Label>
          <select id="hw-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hw-age">{labels.age}</Label>
          <select id="hw-age" className={selectCls} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
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
        <Button onClick={onGenerate} disabled={pending || !topic.trim()}>
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
