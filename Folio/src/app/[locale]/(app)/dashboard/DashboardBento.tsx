import { Wallet } from "lucide-react";
import type { LessonWithStudents } from "@/lib/lessons/queries";
import type { Balance } from "@/lib/billing/queries";
import { TodayLessons, type TodayLessonsLabels } from "./TodayLessons";
import { GeneratePanel, type GenerateFormLabels, type GenerateDashLabels, type GenerateAssignLabels } from "./GeneratePanel";
import { MiniBlock } from "./MiniBlock";
import { MagicBackground } from "./MagicBackground";

// ВРЕМЕННО (2026-07): homework-блок дашборда («на проверку / просрочено») скрыт вместе с онлайн-сдачей ДЗ.
// Пропсы hw/hwLabels, тип HwBuckets и homeworkBuckets() убраны из UI; восстановить — из git-истории.

export interface DashboardBentoProps {
  nowISO: string;
  todayLessons: LessonWithStudents[];
  debtors: { rows: Balance[]; total: number };
  students: { id: string; name: string }[];
  todayLabels: TodayLessonsLabels;
  genForm: GenerateFormLabels;
  genDash: GenerateDashLabels;
  genAssign: GenerateAssignLabels;
  debtLabels: { debts: string; toReceive: string; noDebts: string };
}

export function DashboardBento(p: DashboardBentoProps) {
  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* Ambient magic circle behind the bento (shows through the gaps between cards). */}
      <MagicBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 p-4 md:px-6 md:pt-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        {/* Left: today's lessons */}
        <div className="flex flex-col gap-5">
          <TodayLessons lessons={p.todayLessons} nowISO={p.nowISO} labels={p.todayLabels} />
        </div>

        {/* Center: generate + proofread */}
        <div className="flex flex-col gap-5">
          <GeneratePanel form={p.genForm} dash={p.genDash} students={p.students} assign={p.genAssign} />
        </div>

        {/* Right: debts (expandable). ВРЕМЕННО (2026-07): homework-блок «на проверку» скрыт. */}
        <div className="flex flex-col gap-5">
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
    </div>
  );
}
