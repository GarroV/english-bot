"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Users, CalendarPlus, Wallet, History } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QuickPaymentDialog, type QuickPaymentLabels } from "../billing/QuickPaymentDialog";

export interface HeaderActionsLabels {
  history: string;
  manageStudents: string;
  addLesson: string;
  addPayment: string;
}

const pill = "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold transition-colors hover:border-primary";

// Dashboard header quick actions: students/lesson/payment + history + theme toggle.
// "+ Оплата" opens an inline dialog; lessons/students link into their screens.
export function HeaderActions({
  students, labels, paymentLabels, themeLabels,
}: {
  students: { id: string; name: string }[];
  labels: HeaderActionsLabels;
  paymentLabels: QuickPaymentLabels;
  themeLabels: { system: string; light: string; dark: string };
}) {
  const [payOpen, setPayOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/homework" className={pill}><History className="h-4 w-4 text-muted-foreground" />{labels.history}</Link>
      <Link href="/schedule" className={pill}><Users className="h-4 w-4 text-muted-foreground" />{labels.manageStudents}</Link>
      <Link href="/schedule" className={pill}><CalendarPlus className="h-4 w-4 text-primary" />{labels.addLesson}</Link>
      <button type="button" onClick={() => setPayOpen(true)} className={pill}>
        <Wallet className="h-4 w-4 text-primary" />{labels.addPayment}
      </button>
      <ThemeToggle labels={themeLabels} />
      <QuickPaymentDialog open={payOpen} onOpenChange={setPayOpen} students={students} labels={paymentLabels} />
    </div>
  );
}
