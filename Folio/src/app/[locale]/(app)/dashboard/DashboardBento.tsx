import { PencilLine, Wallet } from "lucide-react";
import type { LessonWithStudents } from "@/lib/lessons/queries";
import type { Balance } from "@/lib/billing/queries";
import type { AssignmentRow } from "@/lib/homework/queries";
import { TodayLessons, type TodayLessonsLabels } from "./TodayLessons";
import { GeneratePanel, type GenerateFormLabels, type GenerateDashLabels, type GenerateAssignLabels } from "./GeneratePanel";
import { MiniBlock } from "./MiniBlock";
import { HeaderActions, type HeaderActionsLabels } from "./HeaderActions";
import type { QuickPaymentLabels } from "../billing/QuickPaymentDialog";

interface HwBuckets {
  review: AssignmentRow[];
  overdue: AssignmentRow[];
  reviewCount: number;
  overdueCount: number;
}

export interface DashboardBentoProps {
  title: string;
  nowISO: string;
  todayLessons: LessonWithStudents[];
  debtors: { rows: Balance[]; total: number };
  hw: HwBuckets;
  students: { id: string; name: string }[];
  todayLabels: TodayLessonsLabels;
  genForm: GenerateFormLabels;
  genDash: GenerateDashLabels;
  genAssign: GenerateAssignLabels;
  headerLabels: HeaderActionsLabels;
  paymentLabels: QuickPaymentLabels;
  hwLabels: { homework: string; onCheck: string; overdue: string; noHomework: string };
  debtLabels: { debts: string; toReceive: string; noDebts: string };
}

export function DashboardBento(p: DashboardBentoProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-5 p-5 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{p.title}</h1>
        <HeaderActions
          students={p.students}
          labels={p.headerLabels}
          paymentLabels={p.paymentLabels}
        />
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        {/* Left: today's lessons */}
        <div className="flex flex-col gap-5">
          <TodayLessons lessons={p.todayLessons} nowISO={p.nowISO} labels={p.todayLabels} />
        </div>

        {/* Center: generate + proofread */}
        <div className="flex flex-col gap-5">
          <GeneratePanel form={p.genForm} dash={p.genDash} students={p.students} assign={p.genAssign} />
        </div>

        {/* Right: homework + debts (expandable) */}
        <div className="flex flex-col gap-5">
          <MiniBlock
            icon={<PencilLine className="h-5 w-5" />}
            value={String(p.hw.reviewCount + p.hw.overdueCount)}
            title={p.hwLabels.homework}
            sub={`${p.hw.reviewCount} ${p.hwLabels.onCheck} · ${p.hw.overdueCount} ${p.hwLabels.overdue}`}
            tone="amber"
          >
            {p.hw.review.length + p.hw.overdue.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{p.hwLabels.noHomework}</p>
            ) : (
              <ul>
                {[...p.hw.review.map((a) => ({ a, kind: "review" as const })),
                  ...p.hw.overdue.map((a) => ({ a, kind: "overdue" as const }))].map(({ a, kind }) => (
                  <li key={a.id} className="flex items-center gap-2 border-t border-border py-2 text-sm first:border-t-0">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.template_topic ?? "—"}</span>
                      <span className="text-muted-foreground"> · {a.student_name ?? "—"}</span>
                    </span>
                    <span className={`ml-auto flex-none rounded-full px-2 py-0.5 text-xs font-bold ${
                      kind === "overdue"
                        ? "bg-[color:var(--brand-coral)]/15 text-[color:var(--brand-coral)]"
                        : "bg-amber-500/15 text-amber-500"
                    }`}>
                      {kind === "overdue" ? p.hwLabels.overdue : p.hwLabels.onCheck}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </MiniBlock>

          <MiniBlock
            icon={<Wallet className="h-5 w-5" />}
            value={`${p.debtors.total} ₽`}
            title={p.debtLabels.debts}
            sub={`${p.debtors.rows.length} · ${p.debtLabels.toReceive}`}
            tone="coral"
          >
            {p.debtors.rows.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{p.debtLabels.noDebts}</p>
            ) : (
              <ul>
                {p.debtors.rows.map((b) => (
                  <li key={b.student_id} className="flex items-center gap-2 border-t border-border py-2 text-sm first:border-t-0">
                    <span className="min-w-0 truncate font-medium">{b.name}</span>
                    <span className="ml-auto flex-none font-bold tabular-nums text-[color:var(--brand-coral)]">{b.balance} ₽</span>
                  </li>
                ))}
              </ul>
            )}
          </MiniBlock>
        </div>
      </div>
    </div>
  );
}
