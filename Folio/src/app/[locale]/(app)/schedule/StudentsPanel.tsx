"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StudentForm } from "../students/StudentForm";
import { archiveStudent, restoreStudent } from "@/lib/students/actions";
import type { StudentRow } from "@/lib/students/queries";

interface Labels {
  title: string; add: string; empty: string; name: string; email: string; telegram: string;
  rate: string; notes: string; edit: string; archive: string; restore: string;
  save: string; cancel: string; newStudent: string; editStudent: string;
  showArchived: string; showActive: string; archivedBadge: string;
  saved: string; saveError: string; archivedToast: string; restoredToast: string;
}

// Right-column students panel for the merged schedule screen. Add/edit open the
// shared StudentForm dialog; the archived view toggles client-side (no extra query).
export function StudentsPanel({ students, labels }: {
  students: StudentRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const formLabels = {
    name: labels.name, email: labels.email, telegram: labels.telegram, rate: labels.rate,
    notes: labels.notes, save: labels.save, cancel: labels.cancel,
    saved: labels.saved, saveError: labels.saveError,
  };

  const visible = showArchived ? students : students.filter((s) => s.archived_at == null);

  async function onArchive(id: string, archived: boolean) {
    setBusyId(id);
    const res = archived ? await restoreStudent(id) : await archiveStudent(id);
    setBusyId(null);
    if (res.ok) {
      toast.success(archived ? labels.restoredToast : labels.archivedToast);
      router.refresh();
    } else {
      toast.error(`${labels.saveError}: ${res.error}`);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-80">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">{labels.title}</h2>
        <StudentForm mode="create" labels={{ ...formLabels, trigger: labels.add, heading: labels.newStudent }} />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((s) => {
            const archived = s.archived_at != null;
            return (
              <li key={s.id}
                className={`flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-sm ${archived ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {s.name}{archived ? ` (${labels.archivedBadge})` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">{labels.rate}: {s.default_rate ?? "—"}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <StudentForm
                    mode="edit"
                    student={s}
                    labels={{ ...formLabels, trigger: labels.edit, heading: labels.editStudent }}
                  />
                  <Button variant="outline" size="sm" disabled={busyId === s.id} onClick={() => onArchive(s.id, archived)}>
                    {archived ? labels.restore : labels.archive}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? labels.showActive : labels.showArchived}
      </Button>
    </aside>
  );
}
