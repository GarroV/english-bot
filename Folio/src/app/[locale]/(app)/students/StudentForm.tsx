"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStudent, updateStudent } from "@/lib/students/actions";
import type { StudentInput } from "@/lib/students/schema";

interface StudentLike {
  id: string;
  name: string;
  email: string | null;
  telegram_id: number | null;
  default_rate: number | null;
  notes: string | null;
}

interface Labels {
  trigger: string; heading: string; name: string; email: string; telegram: string;
  rate: string; notes: string; save: string; cancel: string; saved: string; saveError: string;
}

// Convert raw form strings to a validated-shape StudentInput (blanks -> undefined).
function toInput(f: { name: string; email: string; telegram: string; rate: string; notes: string }): StudentInput {
  return {
    name: f.name.trim(),
    email: f.email.trim() || undefined,
    telegramId: f.telegram.trim() ? Number(f.telegram.trim()) : undefined,
    defaultRate: f.rate.trim() ? Number(f.rate.trim()) : undefined,
    notes: f.notes.trim() || undefined,
  };
}

export function StudentForm({ mode, student, labels }: {
  mode: "create" | "edit";
  student?: StudentLike;
  labels: Labels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: student?.name ?? "",
    email: student?.email ?? "",
    telegram: student?.telegram_id != null ? String(student.telegram_id) : "",
    rate: student?.default_rate != null ? String(student.default_rate) : "",
    notes: student?.notes ?? "",
  });
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Seed the form once per open, keyed by mode+id — NOT on every `student` prop identity.
  // On the merged schedule screen a router.refresh() from a sibling action (archive,
  // lesson save, ✓ toggle, drag-drop) gives a fresh student object with the SAME id;
  // keying on id keeps the user's unsaved edits instead of clobbering them.
  const seedKey = open ? `${mode}:${student?.id ?? "new"}` : null;
  if (open && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setForm({
      name: student?.name ?? "",
      email: student?.email ?? "",
      telegram: student?.telegram_id != null ? String(student.telegram_id) : "",
      rate: student?.default_rate != null ? String(student.default_rate) : "",
      notes: student?.notes ?? "",
    });
  } else if (!open && seededFor !== null) {
    // Reset on close so reopening re-seeds from the latest server values.
    setSeededFor(null);
  }

  async function submit() {
    if (mode === "edit" && !student) {
      toast.error(`${labels.saveError}: student missing`);
      return;
    }
    setPending(true);
    const input = toInput(form);
    const res = mode === "create"
      ? await createStudent(input)
      : await updateStudent(student!.id, input);
    setPending(false);
    if (res.ok) {
      toast.success(labels.saved);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(`${labels.saveError}: ${res.error}`);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={mode === "create" ? "default" : "outline"} size="sm" />}>
        {labels.trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels.heading}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-name">{labels.name}</Label>
            <Input id="st-name" value={form.name} onChange={set("name")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-email">{labels.email}</Label>
            <Input id="st-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-tg">{labels.telegram}</Label>
            <Input id="st-tg" inputMode="numeric" value={form.telegram} onChange={set("telegram")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-rate">{labels.rate}</Label>
            <Input id="st-rate" inputMode="decimal" value={form.rate} onChange={set("rate")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="st-notes">{labels.notes}</Label>
            <Input id="st-notes" value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{labels.cancel}</Button>
          <Button onClick={submit} disabled={pending || !form.name.trim()}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
