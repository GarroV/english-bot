"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LessonDialog, type LessonDialogState } from "./LessonDialog";
import { toDatetimeLocal, toDateParam } from "@/lib/lessons/week";
import type { LessonWithStudents, StudentOption } from "@/lib/lessons/queries";

const DAY_START = 7;
const DAY_END = 22;
const HOUR_PX = 56;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function localDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function ScheduleBoard({
  weekStartISO, lessons, students, labels,
}: {
  weekStartISO: string;
  lessons: LessonWithStudents[];
  students: StudentOption[];
  labels: {
    today: string; group: string; noStudents: string;
    dialog: React.ComponentProps<typeof LessonDialog>["labels"];
  };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<LessonDialogState | null>(null);
  const weekStart = new Date(weekStartISO);

  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function gotoWeek(offsetDays: number) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + offsetDays);
    router.push(`/schedule?week=${toDateParam(d)}`);
  }
  function gotoToday() { router.push("/schedule"); }

  function openCreate(dayIdx: number, hour: number) {
    if (students.length === 0) return;
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dayIdx);
    d.setHours(hour, 0, 0, 0);
    setDialog({ mode: "create", datetimeLocal: toDatetimeLocal(d) });
  }
  function openEdit(lesson: LessonWithStudents) {
    setDialog({ mode: "edit", datetimeLocal: toDatetimeLocal(new Date(lesson.scheduled_at)), lesson });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => gotoWeek(-7)}>←</Button>
        <Button variant="outline" size="sm" onClick={gotoToday}>{labels.today}</Button>
        <Button variant="outline" size="sm" onClick={() => gotoWeek(7)}>→</Button>
        <span className="ml-2 font-semibold">
          {dayDates[0].toLocaleDateString()} — {dayDates[6].toLocaleDateString()}
        </span>
      </div>

      {students.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          {labels.noStudents}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div className="border-b border-border" />
          {dayDates.map((d, i) => (
            <div key={i} className="border-b border-l border-border p-2 text-center text-sm font-semibold">
              {DAY_NAMES[i]} {d.getDate()}
            </div>
          ))}

          <div>
            {HOURS.map((h) => (
              <div key={h} className="border-b border-border pr-1 text-right text-xs text-muted-foreground"
                style={{ height: HOUR_PX }}>
                {h}:00
              </div>
            ))}
          </div>

          {dayDates.map((_, dayIdx) => {
            const dayLessons = lessons.filter((l) => localDayIndex(new Date(l.scheduled_at)) === dayIdx);
            return (
              <div key={dayIdx} className="relative border-l border-border">
                {HOURS.map((h) => (
                  <button key={h} type="button" onClick={() => openCreate(dayIdx, h)}
                    className="block w-full border-b border-border transition-colors hover:bg-secondary/50"
                    style={{ height: HOUR_PX }} aria-label={`${DAY_NAMES[dayIdx]} ${h}:00`} />
                ))}
                <div className="pointer-events-none absolute inset-0">
                  {dayLessons.map((l) => {
                    const start = new Date(l.scheduled_at);
                    const minutes = start.getHours() * 60 + start.getMinutes() - DAY_START * 60;
                    const top = Math.max(0, (minutes / 60) * HOUR_PX);
                    const height = Math.max(20, (l.duration_min / 60) * HOUR_PX - 2);
                    const cancelled = l.status === "cancelled";
                    const completed = l.status === "completed";
                    const title = l.type === "group" ? `${labels.group} (${l.students.length})` : (l.students[0]?.name ?? "—");
                    return (
                      <button key={l.id} type="button" onClick={() => openEdit(l)}
                        className={`pointer-events-auto absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs shadow-sm transition ${
                          cancelled
                            ? "border-border bg-muted text-muted-foreground line-through"
                            : completed
                              ? "border-border bg-secondary text-muted-foreground"
                              : "border-primary/30 bg-accent text-accent-foreground"
                        }`}
                        style={{ top, height }}>
                        <span className="font-semibold">
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {completed ? " ✓" : ""}
                        </span>
                        <br />
                        {title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LessonDialog state={dialog} onClose={() => setDialog(null)} students={students} labels={labels.dialog} />
    </div>
  );
}
