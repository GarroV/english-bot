"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { assignTemplate } from "@/lib/homework/assignments";
import type { TemplateRow } from "@/lib/homework/queries";
import type { StudentOption } from "@/lib/lessons/queries";

interface Labels {
  empty: string; templates: string; view: string; hide: string; copy: string; copied: string;
  assign: string; assignTitle: string; students: string; dueDate: string; confirmAssign: string;
  cancel: string; assigned: string; pickStudents: string; saveError: string;
  typeLabels: Record<string, string>;
}

export function TemplatesList({ templates, students, labels }: {
  templates: TemplateRow[];
  students: StudentOption[];
  labels: Labels;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [pending, setPending] = useState(false);

  function startAssign(id: string) { setAssignId(id); setPicked([]); setDue(""); }
  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function copy(content: string) {
    try { await navigator.clipboard.writeText(content); toast.success(labels.copied); }
    catch { toast.error(labels.saveError); }
  }

  async function confirmAssign() {
    if (!assignId) return;
    if (picked.length === 0) { toast.error(labels.pickStudents); return; }
    setPending(true);
    try {
      const res = await assignTemplate({ templateId: assignId, studentIds: picked, dueDate: due || undefined });
      if (res.ok) { toast.success(labels.assigned); setAssignId(null); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  if (templates.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {templates.map((tpl) => (
          <li key={tpl.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{tpl.topic}</span>
                <span className="text-xs text-muted-foreground">
                  {labels.typeLabels[tpl.module_type] ?? tpl.module_type}{tpl.level ? ` · ${tpl.level}` : ""} · {new Date(tpl.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenId(openId === tpl.id ? null : tpl.id)}>
                  {openId === tpl.id ? labels.hide : labels.view}
                </Button>
                <Button size="sm" onClick={() => startAssign(tpl.id)}>{labels.assign}</Button>
              </div>
            </div>
            {openId === tpl.id && (
              <div className="mt-3 flex flex-col gap-2">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-3 font-sans text-sm">{tpl.content}</pre>
                <div><Button variant="outline" size="sm" onClick={() => copy(tpl.content)}>{labels.copy}</Button></div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={assignId !== null} onOpenChange={(o) => { if (!o) setAssignId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.assignTitle}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <span className="text-sm font-medium">{labels.students}</span>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
              {students.map((s) => (
                <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    picked.includes(s.id) ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-secondary"
                  }`}>
                  {s.name}{picked.includes(s.id) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{labels.dueDate}</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignId(null)} disabled={pending}>{labels.cancel}</Button>
            <Button onClick={confirmAssign} disabled={pending || picked.length === 0}>{labels.confirmAssign}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
