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
import { recordPayment } from "@/lib/billing/actions";

export interface QuickPaymentLabels {
  title: string;
  student: string;
  amount: string;
  note: string;
  save: string;
  cancel: string;
  saved: string;
  error: string;
  pickStudent: string;
}

// Reusable "record a payment" dialog: pick a student, amount, optional note.
// Used by the dashboard header quick action (and reusable elsewhere).
export function QuickPaymentDialog({
  open, onOpenChange, students, labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: { id: string; name: string }[];
  labels: QuickPaymentLabels;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const selectCls = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  async function submit() {
    const value = Number(amount);
    if (!studentId || !Number.isFinite(value) || value <= 0) { toast.error(labels.error); return; }
    setPending(true);
    try {
      const res = await recordPayment({ studentId, amount: value, note: note.trim() || undefined });
      if (res.ok) {
        toast.success(labels.saved);
        onOpenChange(false);
        setStudentId(""); setAmount(""); setNote("");
        router.refresh();
      } else {
        toast.error(`${labels.error}: ${res.error}`);
      }
    } catch {
      toast.error(labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="qp-student">{labels.student}</Label>
            <select id="qp-student" className={selectCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="" disabled>{labels.pickStudent}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="qp-amount">{labels.amount}</Label>
            <Input id="qp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="qp-note">{labels.note}</Label>
            <Input id="qp-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>{labels.cancel}</Button>
          <Button onClick={submit} disabled={pending || !studentId || !amount.trim()}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
