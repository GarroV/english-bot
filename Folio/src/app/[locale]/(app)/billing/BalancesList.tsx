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
import { recordPayment, deleteEntry } from "@/lib/billing/actions";
import type { Balance, LedgerEntry } from "@/lib/billing/queries";
import { formatDate } from "@/lib/format/date";

interface Labels {
  student: string; charged: string; paid: string; balance: string; recordPayment: string;
  amount: string; note: string; save: string; cancel: string; saved: string; saveError: string;
  empty: string; ledger: string; hide: string; delete: string; charge: string; payment: string;
  noEntries: string;
}

export function BalancesList({ balances, ledger, labels }: {
  balances: Balance[];
  ledger: LedgerEntry[];
  labels: Labels;
}) {
  const router = useRouter();
  const [payFor, setPayFor] = useState<Balance | null>(null);
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const byStudent = (id: string) => ledger.filter((e) => e.student_id === id);

  function startPay(b: Balance) { setPayFor(b); setAmount(""); setNote(""); }

  async function submitPay() {
    if (!payFor) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error(labels.saveError); return; }
    setPending(true);
    try {
      const res = await recordPayment({ studentId: payFor.student_id, amount: value, note: note.trim() || undefined });
      if (res.ok) { toast.success(labels.saved); setPayFor(null); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      const res = await deleteEntry(id);
      if (res.ok) { toast.success(labels.saved); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  if (balances.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {balances.map((b) => (
          <li key={b.student_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{b.name}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{labels.charged}: {b.charged}</span>
                <span className="text-muted-foreground">{labels.paid}: {b.paid}</span>
                <span className={b.balance > 0 ? "font-bold text-destructive" : "font-bold"}>
                  {labels.balance}: {b.balance}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenLedger(openLedger === b.student_id ? null : b.student_id)}>
                  {openLedger === b.student_id ? labels.hide : labels.ledger}
                </Button>
                <Button size="sm" onClick={() => startPay(b)}>{labels.recordPayment}</Button>
              </div>
            </div>
            {openLedger === b.student_id && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                {byStudent(b.student_id).length === 0 ? (
                  <li className="text-muted-foreground">{labels.noEntries}</li>
                ) : byStudent(b.student_id).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span>
                      {e.type === "charge" ? labels.charge : labels.payment} · {e.amount}
                      {e.note ? ` · ${e.note}` : ""} · {formatDate(e.created_at)}
                    </span>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(e.id)}>{labels.delete}</Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={payFor !== null} onOpenChange={(o) => { if (!o) setPayFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordPayment}{payFor ? ` — ${payFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-amount">{labels.amount}</Label>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pay-note">{labels.note}</Label>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayFor(null)} disabled={pending}>{labels.cancel}</Button>
            <Button onClick={submitPay} disabled={pending || !amount.trim()}>{labels.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
