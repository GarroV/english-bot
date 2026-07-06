"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateHomework, saveTemplate, editHomework } from "@/lib/homework/actions";
import { assignTemplate } from "@/lib/homework/assignments";
import { MODULE_TYPES, LEVELS, AGE_GROUPS, type HomeworkInput } from "@/lib/homework/schema";

// Read the server-provided filename (уровень + тема, как в боте) out of Content-Disposition.
function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match) return "homework.pdf";
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

export interface GenerateFormLabels {
  type: string; topic: string; level: string; age: string; verb: string;
  generate: string; generating: string; saveTemplate: string; saved: string; saveError: string;
  typeReading: string; typeVocabulary: string; typeTranslationTexts: string;
  typeTranslationSentences: string; typeVerb: string;
  ageTeen: string; ageYoung: string; ageAdult: string;
}
export interface GenerateDashLabels {
  generateTitle: string; generateLead: string; draftTitle: string; onReview: string;
  fix: string; fixPlaceholder: string; applyFix: string; fixing: string; regenerate: string; assign: string;
  downloadPdf: string;
}
export interface GenerateAssignLabels {
  title: string; students: string; dueDate: string; confirm: string; cancel: string;
  assigned: string; pickStudents: string; error: string;
}

type ModuleT = (typeof MODULE_TYPES)[number];
type LevelT = (typeof LEVELS)[number];
type AgeT = (typeof AGE_GROUPS)[number];

export function GeneratePanel({
  form, dash, students, assign,
}: {
  form: GenerateFormLabels;
  dash: GenerateDashLabels;
  students: { id: string; name: string }[];
  assign: GenerateAssignLabels;
}) {
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
  const [savedId, setSavedId] = useState<string | null>(null);
  const [fixText, setFixText] = useState("");
  const [pending, setPending] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState("");

  const showVerb = moduleType === "VERB_SENTENCES";

  function currentInput(): HomeworkInput {
    return { moduleType, topic: topic.trim(), level, ageGroup, verb: verb.trim() || undefined };
  }
  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function onGenerate() {
    if (!topic.trim() || (showVerb && !verb.trim())) { toast.error(form.saveError); return; }
    setPending(true); setContent(""); setSavedId(null);
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
      if (res.ok) { setContent(res.content); setFixText(""); setSavedId(null); }
      else toast.error(`${form.saveError}: ${res.error}`);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  // Persist the (possibly hand-edited) draft once; reuse the id for assigning.
  async function ensureSaved(): Promise<string | null> {
    if (savedId) return savedId;
    if (!generatedInput) return null;
    const res = await saveTemplate(generatedInput, content);
    if (!res.ok) { toast.error(`${form.saveError}: ${res.error}`); return null; }
    setSavedId(res.id);
    return res.id;
  }

  async function onSave() {
    setPending(true);
    try { const id = await ensureSaved(); if (id) toast.success(form.saved); }
    finally { setPending(false); }
  }

  // Download the current (possibly hand-edited) draft as a PDF via the tutor-gated server route.
  async function onDownloadPdf() {
    setPending(true);
    try {
      const res = await fetch("/api/homework/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      });
      if (!res.ok) { toast.error(form.saveError); return; }
      const filename = filenameFromDisposition(res.headers.get("content-disposition"));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error(form.saveError); } finally { setPending(false); }
  }

  async function onAssignConfirm() {
    if (picked.length === 0) { toast.error(assign.pickStudents); return; }
    setPending(true);
    try {
      const id = await ensureSaved();
      if (!id) return;
      const res = await assignTemplate({ templateId: id, studentIds: picked, dueDate: due || undefined });
      if (res.ok) { toast.success(assign.assigned); setAssignOpen(false); setPicked([]); setDue(""); router.refresh(); }
      else toast.error(`${assign.error}: ${res.error}`);
    } catch { toast.error(assign.error); } finally { setPending(false); }
  }

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
      active ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
    }`;

  return (
    <section
      className="flex flex-col gap-2.5 rounded-2xl border border-border p-4 shadow-sm"
      style={{ background: "radial-gradient(120% 120% at 0% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 50%), var(--card)" }}
    >
      {/* Intro only before a draft exists — once there's content, give the draft the vertical space. */}
      {!content && (
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">{dash.generateTitle}</h2>
          <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{dash.generateLead}</p>
        </div>
      )}

      {/* ask box */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 p-1.5 pl-3.5 focus-within:border-primary">
        <Sparkles className="h-4 w-4 flex-none text-primary" />
        <input
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !pending) onGenerate(); }}
          placeholder={`${form.topic}: B2, бизнес-лексика, взрослый…`} aria-label={form.topic}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button type="button" onClick={onGenerate} disabled={pending || !topic.trim() || (showVerb && !verb.trim())}
          className="flex-none rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-50">
          {pending && !content ? form.generating : form.generate}
        </button>
      </div>

      {/* compact chips: type + level + age (+ verb) */}
      <div className="flex flex-wrap gap-1.5">
        {MODULE_TYPES.map((t) => (
          <button key={t} type="button" className={chip(moduleType === t)} onClick={() => setModuleType(t)}>
            {moduleType === t ? "✓ " : ""}{typeLabels[t]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {LEVELS.map((l) => <button key={l} type="button" className={chip(level === l)} onClick={() => setLevel(l)}>{l}</button>)}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {AGE_GROUPS.map((a) => <button key={a} type="button" className={chip(ageGroup === a)} onClick={() => setAgeGroup(a)}>{ageLabels[a]}</button>)}
        {showVerb && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <input value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="must / have to" aria-label={form.verb}
              className="w-40 rounded-full border border-border bg-card px-3 py-1 text-xs outline-none focus:border-primary" />
          </>
        )}
      </div>

      {/* draft: editable textarea + AI proofread + actions */}
      {content && (
        <div className="overflow-hidden rounded-xl border border-border bg-card/70">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {dash.draftTitle} · {typeLabels[moduleType]} · {level}
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-500">{dash.onReview}</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setSavedId(null); }}
            spellCheck={false}
            aria-label={dash.draftTitle}
            className="block min-h-[52vh] w-full resize-y bg-transparent p-4 font-sans text-sm leading-relaxed outline-none"
          />
          <div className="flex flex-col gap-2 border-t border-dashed border-border px-4 py-2.5 sm:flex-row sm:items-center">
            <span className="flex-none text-xs font-bold text-[color:var(--brand-coral)]">✎ {dash.fix}:</span>
            <input value={fixText} onChange={(e) => setFixText(e.target.value)} placeholder={dash.fixPlaceholder}
              onKeyDown={(e) => { if (e.key === "Enter" && !pending) onFix(); }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-[color:var(--brand-coral)]" />
            <button type="button" onClick={onFix} disabled={pending || !fixText.trim()}
              className="flex-none rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-50">
              {pending && fixText ? dash.fixing : dash.applyFix}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3.5">
            <button type="button" onClick={onSave} disabled={pending}
              className="rounded-lg bg-primary/12 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
              💾 {form.saveTemplate}{savedId ? " ✓" : ""}
            </button>
            <button type="button" onClick={() => { setPicked([]); setDue(""); setAssignOpen(true); }} disabled={pending}
              className="rounded-lg bg-[color:var(--brand-coral)]/15 px-3 py-2 text-xs font-semibold text-[color:var(--brand-coral)] transition-opacity hover:opacity-80 disabled:opacity-50">
              ＋ {dash.assign}
            </button>
            <button type="button" onClick={onDownloadPdf} disabled={pending}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-50">
              📄 {dash.downloadPdf}
            </button>
            <button type="button" onClick={() => { setContent(""); setGeneratedInput(null); setSavedId(null); setFixText(""); }} disabled={pending}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-50">
              🔄 {dash.regenerate}
            </button>
          </div>
        </div>
      )}

      {/* assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{assign.title}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <span className="text-sm font-medium">{assign.students}</span>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
              {students.length === 0 ? (
                <span className="px-2 py-1 text-sm text-muted-foreground">—</span>
              ) : students.map((s) => (
                <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    picked.includes(s.id) ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-secondary"
                  }`}>
                  {s.name}{picked.includes(s.id) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{assign.dueDate}</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)} disabled={pending}>{assign.cancel}</Button>
            <Button onClick={onAssignConfirm} disabled={pending || picked.length === 0}>{assign.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
