"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveJournalEntry, loadJournalEntry } from "@/lib/journal/actions";
import { CEFR_LEVELS, type JournalInput } from "@/lib/journal/schema";
import type { LessonWithStudents } from "@/lib/lessons/queries";

export interface JournalLabels {
  title: string; topic: string; level: string; levelNone: string; comment: string;
  progress: string; save: string; cancel: string; loading: string; loadError: string;
  saved: string; saveError: string;
}

const EMPTY = { topic: "", level: "", comment: "", progress: "" };

// Convert raw form strings to validated-shape input (blanks -> undefined).
function toInput(f: typeof EMPTY): JournalInput {
  return {
    topic: f.topic.trim() || undefined,
    level: (f.level || undefined) as JournalInput["level"],
    comment: f.comment.trim() || undefined,
    progress: f.progress.trim() || undefined,
  };
}

export function JournalDialog({ lesson, onClose, labels }: {
  lesson: LessonWithStudents | null;
  onClose: () => void;
  labels: JournalLabels;
}) {
  const router = useRouter();
  const open = lesson !== null;
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY);

  // Load the existing entry when the dialog opens for a lesson (external fetch).
  // A failed load must NOT look like an empty entry — otherwise saving would
  // upsert over (and clobber) the existing row. Surface the error and block save.
  useEffect(() => {
    if (!lesson) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    loadJournalEntry(lesson.id)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) { setLoadError(true); setForm(EMPTY); return; }
        setForm(res.entry
          ? {
              topic: res.entry.topic ?? "",
              level: res.entry.level ?? "",
              comment: res.entry.comment ?? "",
              progress: res.entry.progress ?? "",
            }
          : EMPTY);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setForm(EMPTY); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lesson]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const isEmpty = !form.topic.trim() && !form.level && !form.comment.trim() && !form.progress.trim();

  async function submit() {
    if (!lesson) return;
    setPending(true);
    try {
      const res = await saveJournalEntry(lesson.id, toInput(form));
      if (res.ok) { toast.success(labels.saved); onClose(); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  const who = lesson ? lesson.students.map((s) => s.name).join(", ") : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}{who ? ` — ${who}` : ""}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
        ) : loadError ? (
          <p className="py-6 text-center text-sm text-destructive">{labels.loadError}</p>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="jr-topic">{labels.topic}</Label>
              <Input id="jr-topic" value={form.topic} onChange={set("topic")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="jr-level">{labels.level}</Label>
              <select id="jr-level" value={form.level} onChange={set("level")}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <option value="">{labels.levelNone}</option>
                {CEFR_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="jr-comment">{labels.comment}</Label>
              <textarea id="jr-comment" rows={3} value={form.comment} onChange={set("comment")}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="jr-progress">{labels.progress}</Label>
              <textarea id="jr-progress" rows={2} value={form.progress} onChange={set("progress")}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{labels.cancel}</Button>
          <Button onClick={submit} disabled={pending || loading || loadError || isEmpty}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
