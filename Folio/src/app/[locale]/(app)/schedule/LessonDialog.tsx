"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLesson, updateLesson, cancelLesson, completeLesson, cancelLessonLate } from "@/lib/lessons/actions";
import { fromDatetimeLocal } from "@/lib/lessons/week";
import type { StudentOption, LessonWithStudents } from "@/lib/lessons/queries";

export interface LessonDialogState {
  mode: "create" | "edit";
  datetimeLocal: string;
  lesson?: LessonWithStudents;
}

interface Labels {
  newLesson: string; editLesson: string; datetime: string; duration: string;
  location: string; online: string; offline: string; students: string; notes: string; rateOverride: string;
  save: string; cancel: string; cancelLesson: string; complete: string;
  saved: string; saveError: string; pickStudents: string; journal: string;
  lateCancelTitle: string; lateCancelBody: string; lateCancelNone: string;
  lateCancelHalf: string; lateCancelFull: string;
}

export function LessonDialog({
  state, onClose, students, labels, onOpenJournal,
}: {
  state: LessonDialogState | null;
  onClose: () => void;
  students: StudentOption[];
  labels: Labels;
  onOpenJournal?: (lesson: LessonWithStudents) => void;
}) {
  const router = useRouter();
  const open = state !== null;
  const editing = state?.mode === "edit";
  const [pending, setPending] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState<"online" | "offline">("online");
  const [notes, setNotes] = useState("");
  const [rate, setRate] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [lateCancelOpen, setLateCancelOpen] = useState(false);
  const seedKey = state ? `${state.mode}:${state.lesson?.id ?? state.datetimeLocal}` : null;
  if (open && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setDatetime(state.datetimeLocal);
    setDuration(String(state.lesson?.duration_min ?? 60));
    setLocation(state.lesson?.location_type ?? "online");
    setNotes(state.lesson?.notes ?? "");
    setRate(state.lesson?.rate_override != null ? String(state.lesson.rate_override) : "");
    setPicked(state.lesson ? state.lesson.students.map((s) => s.id) : []);
  } else if (!open && seededFor !== null) {
    // Reset on close so reopening the same slot re-seeds instead of showing stale state.
    setSeededFor(null);
    setLateCancelOpen(false);
  }

  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function submit() {
    if (!state) return;
    if (state.mode === "create" && picked.length === 0) { toast.error(labels.pickStudents); return; }
    // Empty → no override (null). RU tutors type "1,5" — normalize the decimal comma before parsing.
    // Reject non-numeric / negative before hitting the server.
    const rateStr = rate.trim().replace(",", ".");
    const parsedRate = rateStr === "" ? null : Number(rateStr);
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)) {
      toast.error(labels.saveError); return;
    }
    setPending(true);
    try {
      const res = state.mode === "create"
        ? await createLesson({
            scheduledAt: fromDatetimeLocal(datetime),
            durationMin: Number(duration),
            locationType: location,
            studentIds: picked,
            notes: notes.trim() || undefined,
            rateOverride: parsedRate ?? undefined,
          })
        : await updateLesson(state.lesson!.id, {
            scheduledAt: fromDatetimeLocal(datetime),
            durationMin: Number(duration),
            locationType: location,
            notes: notes.trim() || undefined,
            rateOverride: parsedRate,
          });
      if (res.ok) { toast.success(labels.saved); onClose(); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function runAction(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    if (!state?.lesson) return;
    setPending(true);
    try {
      const res = await fn(state.lesson.id);
      if (res.ok) { toast.success(labels.saved); onClose(); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error ?? ""}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? labels.editLesson : labels.newLesson}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-dt">{labels.datetime}</Label>
            <Input id="ls-dt" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-dur">{labels.duration}</Label>
            <Input id="ls-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{labels.location}</span>
            <div className="flex gap-2">
              {(["online", "offline"] as const).map((loc) => (
                <Button key={loc} type="button" size="sm"
                  variant={location === loc ? "default" : "outline"}
                  onClick={() => setLocation(loc)}>
                  {loc === "online" ? labels.online : labels.offline}
                </Button>
              ))}
            </div>
          </div>
          {!editing && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{labels.students}</span>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {students.map((s) => (
                  <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      picked.includes(s.id) ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-secondary"
                    }`}>
                    {s.name}{picked.includes(s.id) ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          {editing && (
            <p className="text-sm text-muted-foreground">
              {labels.students}: {state?.lesson?.students.map((s) => s.name).join(", ") || "—"}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-notes">{labels.notes}</Label>
            <Input id="ls-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ls-rate">{labels.rateOverride}</Label>
            <Input id="ls-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="—" />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {editing && (
            <>
              {state?.lesson?.status === "completed" && onOpenJournal && (
                <Button variant="outline" size="sm" disabled={pending}
                  onClick={() => { const l = state.lesson!; onClose(); onOpenJournal(l); }}>
                  {labels.journal}
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={pending} onClick={() => {
                const startsAt = state?.lesson ? new Date(state.lesson.scheduled_at).getTime() : 0;
                const isLate = state?.lesson?.status === "scheduled" && startsAt - Date.now() < 24 * 3_600_000 && startsAt > Date.now();
                if (isLate) setLateCancelOpen(true);
                else runAction(cancelLesson);
              }}>
                {labels.cancelLesson}
              </Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => runAction(completeLesson)}>
                {labels.complete}
              </Button>
            </>
          )}
          <Button variant="ghost" disabled={pending} onClick={onClose}>{labels.cancel}</Button>
          <Button disabled={pending || !datetime} onClick={submit}>{labels.save}</Button>
        </DialogFooter>
        {lateCancelOpen && (
          <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/8 p-3">
            <p className="text-sm font-semibold">{labels.lateCancelTitle}</p>
            <p className="mb-2 text-sm text-muted-foreground">{labels.lateCancelBody}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() => { setLateCancelOpen(false); runAction(cancelLesson); }}>
                {labels.lateCancelNone}
              </Button>
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() => { setLateCancelOpen(false); runAction((id) => cancelLessonLate(id, 0.5)); }}>
                {labels.lateCancelHalf}
              </Button>
              <Button size="sm" disabled={pending}
                onClick={() => { setLateCancelOpen(false); runAction((id) => cancelLessonLate(id, 1)); }}>
                {labels.lateCancelFull}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
