"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadJournalForStudent } from "@/lib/journal/actions";
import type { JournalEntryWithLesson } from "@/lib/journal/queries";
import { formatDate } from "@/lib/format/date";

export interface StudentJournalLabels {
  historyTitle: string; historyEmpty: string; progress: string;
  loading: string; loadError: string; close: string;
}

export function StudentJournalDialog({ student, onClose, labels }: {
  student: { id: string; name: string } | null;
  onClose: () => void;
  labels: StudentJournalLabels;
}) {
  const open = student !== null;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [entries, setEntries] = useState<JournalEntryWithLesson[]>([]);

  // Load the student's history when the dialog opens (external fetch). A failed load
  // must not masquerade as "no entries yet" — surface a distinct error instead.
  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    loadJournalForStudent(student.id)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) { setLoadError(true); setEntries([]); return; }
        setEntries(res.entries);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setEntries([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [student]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.historyTitle}{student ? ` — ${student.name}` : ""}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
        ) : loadError ? (
          <p className="py-6 text-center text-sm text-destructive">{labels.loadError}</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.historyEmpty}</p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-2">
            {entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
                <div className="font-medium">
                  {formatDate(e.scheduled_at)}{e.level ? ` · ${e.level}` : ""}{e.topic ? ` · ${e.topic}` : ""}
                </div>
                {e.comment && <p className="mt-1 text-muted-foreground">{e.comment}</p>}
                {e.progress && (
                  <p className="mt-1"><span className="text-muted-foreground">{labels.progress}: </span>{e.progress}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{labels.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
