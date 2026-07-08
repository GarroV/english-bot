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
import { recordPayment, recordCharge, deleteEntry } from "@/lib/billing/actions";
import { buildReminderMessage, buildMonthStatement } from "@/lib/billing/reminder";
import { mskMonthKey } from "@/lib/billing/summary";
import type { HistoryRow } from "@/lib/billing/fifo";
import { formatDate } from "@/lib/format/date";
import { formatRub } from "@/lib/format/money";

export interface StudentCardData {
  student_id: string; name: string;
  balance: number; debt: number; advance: number;
  advanceLessons: number | null;
  oldestDebtDays: number | null;
  paidUpTo: string | null;
  defaultRate: number | null;
  rows: HistoryRow[];
}

export interface CardLabels {
  recordPayment: string; recordCharge: string; amount: string; note: string; save: string; cancel: string;
  saved: string; saveError: string; empty: string; ledger: string; hide: string; delete: string;
  payment: string; noEntries: string;
  debtBadge: string; paidUpTo: string; advanceBadge: string; advanceLessons: string; advanceRenew: string;
  lessonFrom: string; statusPaid: string; statusPartial: string; statusDebt: string; cancelledBadge: string;
  extraCharge: string; discount: string; chargeKindExtra: string; chargeKindDiscount: string; notePlaceholder: string;
  chipPayOffDebt: string; chipLessons: string;
  remind: string; remindCopied: string; remindDebt: string; remindStatement: string;
}

// Простая интерполяция raw-шаблонов next-intl ("{amount}" и т.п.) на клиенте.
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function StudentCards({ cards, monthKey, monthLabel, labels }: {
  cards: StudentCardData[]; monthKey: string; monthLabel: string;
  labels: CardLabels;
}) {
  const router = useRouter();
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<StudentCardData | null>(null);
  const [chargeFor, setChargeFor] = useState<StudentCardData | null>(null);
  const [remindFor, setRemindFor] = useState<StudentCardData | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"extra" | "discount">("extra");
  const [pending, setPending] = useState(false);

  const parseAmount = (s: string) => Number(s.trim().replace(",", "."));

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, close: () => void) {
    setPending(true);
    try {
      const res = await fn();
      if (res.ok) { toast.success(labels.saved); close(); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error ?? ""}`);
    } catch { toast.error(labels.saveError); } finally { setPending(false); }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success(labels.remindCopied); }
    catch { toast.error(labels.saveError); }
    setRemindFor(null);
  }

  if (cards.length === 0) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {cards.map((c) => (
          <li key={c.student_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{c.name}</span>
              {c.debt > 0 && c.oldestDebtDays !== null && (
                <span className="rounded-full bg-destructive/12 px-2.5 py-0.5 text-xs font-bold text-destructive">
                  {fill(labels.debtBadge, { amount: formatRub(c.debt), days: c.oldestDebtDays })}
                </span>
              )}
              {c.advance > 0 && (
                <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {fill(labels.advanceBadge, { amount: formatRub(c.advance) })}
                  {c.advanceLessons !== null && c.advanceLessons > 0 && ` ${fill(labels.advanceLessons, { count: c.advanceLessons })}`}
                </span>
              )}
              {c.advance > 0 && c.advanceLessons !== null && c.advanceLessons <= 1 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">{labels.advanceRenew}</span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenLedger(openLedger === c.student_id ? null : c.student_id)}>
                  {openLedger === c.student_id ? labels.hide : labels.ledger}
                </Button>
                {c.debt > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setRemindFor(c)}>💬 {labels.remind}</Button>
                )}
                <Button size="sm" onClick={() => { setPayFor(c); setAmount(""); setNote(""); }}>{labels.recordPayment}</Button>
              </div>
            </div>
            {c.debt > 0 && c.paidUpTo && (
              <p className="mt-1 text-xs text-muted-foreground">{fill(labels.paidUpTo, { date: formatDate(c.paidUpTo) })}</p>
            )}

            {openLedger === c.student_id && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setChargeFor(c); setAmount(""); setNote(""); setKind("extra"); }}>
                    + {labels.recordCharge}
                  </Button>
                </div>
                {c.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{labels.noEntries}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {c.rows.map((r) => (
                      <li key={r.id} className={`flex items-center justify-between gap-2 ${r.kind === "payment" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        <span className="min-w-0 truncate">
                          {r.kind === "payment" && `${labels.payment} ${formatDate(r.date)} · ${formatRub(r.amount)}${r.note ? ` · ${r.note}` : ""}`}
                          {r.kind === "lesson_charge" && (
                            <>
                              {fill(labels.lessonFrom, { date: formatDate(r.date) })} · {formatRub(r.amount)} ·{" "}
                              <StatusBadge row={r} labels={labels} />
                              {r.cancelled && <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs">{labels.cancelledBadge}</span>}
                            </>
                          )}
                          {r.kind === "manual_charge" && `${r.amount < 0 ? labels.discount : labels.extraCharge} · ${formatRub(Math.abs(r.amount))}${r.note ? ` · ${r.note}` : ""} · ${formatDate(r.date)}`}
                        </span>
                        <Button variant="ghost" size="sm" disabled={pending}
                          onClick={() => run(() => deleteEntry(r.id), () => {})}>
                          {labels.delete}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Оплата: чипы быстрых сумм */}
      <Dialog open={payFor !== null} onOpenChange={(o) => { if (!o) setPayFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordPayment}{payFor ? ` — ${payFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {payFor && (
              <div className="flex flex-wrap gap-1.5">
                {payFor.debt > 0 && (
                  <Chip active onClick={() => setAmount(String(payFor.debt))}>
                    {fill(labels.chipPayOffDebt, { amount: formatRub(payFor.debt) })}
                  </Chip>
                )}
                {payFor.defaultRate != null && payFor.defaultRate > 0 && [1, 4, 8].map((n) => (
                  <Chip key={n} onClick={() => setAmount(String(n * payFor.defaultRate!))}>
                    {fill(labels.chipLessons, { count: n, amount: formatRub(n * payFor.defaultRate!) })}
                  </Chip>
                ))}
              </div>
            )}
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
            <Button disabled={pending || !amount.trim() || !(parseAmount(amount) > 0)}
              onClick={() => payFor && run(
                () => recordPayment({ studentId: payFor.student_id, amount: parseAmount(amount), note: note.trim() || undefined }),
                () => setPayFor(null),
              )}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ручное начисление: доплата / скидка */}
      <Dialog open={chargeFor !== null} onOpenChange={(o) => { if (!o) setChargeFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.recordCharge}{chargeFor ? ` — ${chargeFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex gap-2">
              {(["extra", "discount"] as const).map((k) => (
                <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {k === "extra" ? labels.chargeKindExtra : labels.chargeKindDiscount}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ch-amount">{labels.amount}</Label>
              <Input id="ch-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ch-note">{labels.note}</Label>
              <Input id="ch-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={labels.notePlaceholder} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChargeFor(null)} disabled={pending}>{labels.cancel}</Button>
            <Button disabled={pending || !amount.trim() || !(parseAmount(amount) > 0)}
              onClick={() => chargeFor && run(
                () => recordCharge({ studentId: chargeFor.student_id, amount: parseAmount(amount), kind, note: note.trim() || undefined }),
                () => setChargeFor(null),
              )}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Напомнить: долг / выписка за месяц */}
      <Dialog open={remindFor !== null} onOpenChange={(o) => { if (!o) setRemindFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>💬 {labels.remind}{remindFor ? ` — ${remindFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" disabled={pending}
              onClick={() => remindFor && copyText(buildReminderMessage(remindFor.name, remindFor.rows, null))}>
              {labels.remindDebt}
            </Button>
            <Button variant="outline" disabled={pending}
              onClick={() => remindFor && copyText(buildMonthStatement(
                remindFor.name, monthLabel,
                remindFor.rows.filter((r) => mskMonthKey(r.date) === monthKey),
                null,
              ))}>
              {labels.remindStatement}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ row, labels }: { row: HistoryRow; labels: CardLabels }) {
  if (row.status === "paid") return <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ {labels.statusPaid}</span>;
  if (row.status === "partial") {
    return <span className="font-semibold text-amber-600 dark:text-amber-400">
      ◑ {fill(labels.statusPartial, { covered: formatRub(row.covered), amount: formatRub(row.amount) })}
    </span>;
  }
  return <span className="font-semibold text-destructive">✗ {labels.statusDebt}</span>;
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
      }`}>
      {children}
    </button>
  );
}
