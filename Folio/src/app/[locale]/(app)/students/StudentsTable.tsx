"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StudentForm } from "./StudentForm";
import { archiveStudent, restoreStudent } from "@/lib/students/actions";
import type { StudentRow } from "@/lib/students/queries";

interface Labels {
  add: string; empty: string; name: string; email: string; telegram: string; rate: string;
  created: string; actions: string; edit: string; archive: string; restore: string;
  save: string; cancel: string; notes: string; newStudent: string; editStudent: string;
  showArchived: string; showActive: string; archivedBadge: string;
  saved: string; saveError: string; archivedToast: string; restoredToast: string;
}

export function StudentsTable({ students, includeArchived, labels }: {
  students: StudentRow[];
  includeArchived: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const formLabels = {
    name: labels.name, email: labels.email, telegram: labels.telegram, rate: labels.rate,
    notes: labels.notes, save: labels.save, cancel: labels.cancel,
    saved: labels.saved, saveError: labels.saveError,
  };

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <StudentForm mode="create" labels={{ ...formLabels, trigger: labels.add, heading: labels.newStudent }} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(includeArchived ? "/students" : "/students?archived=1")}
        >
          {includeArchived ? labels.showActive : labels.showArchived}
        </Button>
      </div>

      {students.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>{labels.name}</TableHead>
              <TableHead>{labels.email}</TableHead>
              <TableHead>{labels.telegram}</TableHead>
              <TableHead>{labels.rate}</TableHead>
              <TableHead className="text-right">{labels.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => {
              const archived = s.archived_at != null;
              return (
                <TableRow key={s.id} className={archived ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {s.name}{archived ? ` (${labels.archivedBadge})` : ""}
                  </TableCell>
                  <TableCell>{s.email ?? "—"}</TableCell>
                  <TableCell>{s.telegram_id ?? "—"}</TableCell>
                  <TableCell>{s.default_rate ?? "—"}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <StudentForm
                      mode="edit"
                      student={s}
                      labels={{ ...formLabels, trigger: labels.edit, heading: labels.editStudent }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === s.id}
                      onClick={() => onArchive(s.id, archived)}
                    >
                      {archived ? labels.restore : labels.archive}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
