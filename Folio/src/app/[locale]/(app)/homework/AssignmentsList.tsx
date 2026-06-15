"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { updateAssignmentStatus } from "@/lib/homework/assignments";
import { ASSIGNMENT_STATUSES } from "@/lib/homework/assignments-schema";
import type { AssignmentRow } from "@/lib/homework/queries";

interface Labels {
  assignmentsTitle: string; noAssignments: string; noDue: string; saveError: string;
  typeKey: (m: string) => string;
  statusLabel: (s: string) => string;
}

export function AssignmentsList({ assignments, labels }: {
  assignments: AssignmentRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await updateAssignmentStatus(id, status);
      if (res.ok) router.refresh();
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{labels.assignmentsTitle}</h2>
      {assignments.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.noAssignments}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{a.student_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {a.template_topic ?? "—"}{a.template_type ? ` · ${labels.typeKey(a.template_type)}` : ""} · {a.due_date ?? labels.noDue}
                </span>
              </div>
              <select
                className="rounded-lg border border-border bg-card px-2 py-1 text-sm"
                value={a.status}
                disabled={busyId === a.id}
                onChange={(e) => changeStatus(a.id, e.target.value)}
              >
                {ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{labels.statusLabel(s)}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
