"use client";

import { useState } from "react";
import { CalendarPlus, Wallet } from "lucide-react";
import { QuickPaymentDialog, type QuickPaymentLabels } from "../billing/QuickPaymentDialog";
import { QuickLessonDialog, type QuickLessonLabels } from "../schedule/QuickLessonDialog";

export interface HeaderActionsLabels {
  addLesson: string;
  addPayment: string;
}

const pill = "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary";

// Global quick-create actions, hosted in the top bar next to the theme toggle.
// Labels hide on narrow screens to keep the bar compact (icon stays as the affordance).
export function HeaderActions({
  students, labels, paymentLabels, lessonLabels,
}: {
  students: { id: string; name: string }[];
  labels: HeaderActionsLabels;
  paymentLabels: QuickPaymentLabels;
  lessonLabels: QuickLessonLabels;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setLessonOpen(true)} className={pill} title={labels.addLesson}>
        <CalendarPlus className="h-4 w-4 text-primary" /><span className="hidden sm:inline">{labels.addLesson}</span>
      </button>
      <button type="button" onClick={() => setPayOpen(true)} className={pill} title={labels.addPayment}>
        <Wallet className="h-4 w-4 text-primary" /><span className="hidden sm:inline">{labels.addPayment}</span>
      </button>
      <QuickLessonDialog open={lessonOpen} onOpenChange={setLessonOpen} students={students} labels={lessonLabels} />
      <QuickPaymentDialog open={payOpen} onOpenChange={setPayOpen} students={students} labels={paymentLabels} />
    </div>
  );
}
