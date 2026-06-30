"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { CalendarPlus, Wallet } from "lucide-react";
import { QuickPaymentDialog, type QuickPaymentLabels } from "../billing/QuickPaymentDialog";

export interface HeaderActionsLabels {
  addLesson: string;
  addPayment: string;
}

const pill = "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold transition-colors hover:border-primary";

// Dashboard quick-create actions. Section navigation + theme live in the top bar.
export function HeaderActions({
  students, labels, paymentLabels,
}: {
  students: { id: string; name: string }[];
  labels: HeaderActionsLabels;
  paymentLabels: QuickPaymentLabels;
}) {
  const [payOpen, setPayOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/schedule" className={pill}><CalendarPlus className="h-4 w-4 text-primary" />{labels.addLesson}</Link>
      <button type="button" onClick={() => setPayOpen(true)} className={pill}>
        <Wallet className="h-4 w-4 text-primary" />{labels.addPayment}
      </button>
      <QuickPaymentDialog open={payOpen} onOpenChange={setPayOpen} students={students} labels={paymentLabels} />
    </div>
  );
}
