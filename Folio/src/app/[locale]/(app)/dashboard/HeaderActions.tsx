"use client";

import { useState } from "react";
import { CalendarPlus, Wallet } from "lucide-react";
import { QuickPaymentDialog, type QuickPaymentLabels } from "../billing/QuickPaymentDialog";
import { QuickLessonDialog, type QuickLessonLabels } from "../schedule/QuickLessonDialog";

export interface HeaderActionsLabels {
  addLesson: string;
  addPayment: string;
}

// Icon-only quick actions, matching the theme/feedback icon buttons in the same bar.
// Text is intentionally dropped (owner request); the accessible name lives in aria-label + native title.
const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-primary transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring";

// Global quick-create actions, hosted in the top bar next to the theme toggle.
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
      <button type="button" onClick={() => setLessonOpen(true)} className={iconBtn} title={labels.addLesson} aria-label={labels.addLesson}>
        <CalendarPlus className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setPayOpen(true)} className={iconBtn} title={labels.addPayment} aria-label={labels.addPayment}>
        <Wallet className="h-4 w-4" />
      </button>
      <QuickLessonDialog open={lessonOpen} onOpenChange={setLessonOpen} students={students} labels={lessonLabels} />
      <QuickPaymentDialog open={payOpen} onOpenChange={setPayOpen} students={students} labels={paymentLabels} />
    </div>
  );
}
