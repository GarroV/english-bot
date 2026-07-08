"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LessonDialog, type LessonDialogState } from "./LessonDialog";
import { JournalDialog } from "./JournalDialog";
import { completeLesson, reopenLesson, updateLesson } from "@/lib/lessons/actions";
import { toDatetimeLocal, toDateParam } from "@/lib/lessons/week";
import { formatDate } from "@/lib/format/date";
import type { LessonWithStudents, StudentOption } from "@/lib/lessons/queries";

const DAY_START = 7;
const DAY_END = 22;
const HOUR_PX = 48;
const MIN_CARD_PX = 30;
const WORK_DAY_START = 9; // initial vertical scroll target inside the grid
const GRID_BOTTOM_GAP_PX = 24; // breathing room between the grid and the viewport bottom
const GRID_MIN_H_PX = 5 * HOUR_PX; // never collapse below ~5 hour rows on short viewports
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
    journal: React.ComponentProps<typeof JournalDialog>["labels"];
  };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<LessonDialogState | null>(null);
  const [journalFor, setJournalFor] = useState<LessonWithStudents | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Cap the grid to the viewport (scroll stays inside the container, not the page) and
  // start at working hours. Top offset is measured once; height changes track via dvh.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = Math.ceil(el.getBoundingClientRect().top);
    el.style.maxHeight = `max(${GRID_MIN_H_PX}px, calc(100dvh - ${top + GRID_BOTTOM_GAP_PX}px))`;
    el.scrollTop = (WORK_DAY_START - DAY_START) * HOUR_PX;
  }, []);
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

  // Toggle "состоялось" straight from the card checkbox (no dialog): scheduled <-> completed.
  async function toggleComplete(lesson: LessonWithStudents) {
    setBusy(true);
    try {
      const res = lesson.status === "completed"
        ? await reopenLesson(lesson.id)
        : await completeLesson(lesson.id);
      if (res.ok) { toast.success(labels.dialog.saved); router.refresh(); }
      else toast.error(`${labels.dialog.saveError}: ${res.error ?? ""}`);
    } catch {
      toast.error(labels.dialog.saveError);
    } finally {
      setBusy(false);
    }
  }

  // Drag a lesson onto a day column to reschedule it (snaps to the hour at the drop Y).
  async function handleDrop(e: React.DragEvent<HTMLDivElement>, dayIdx: number, lesson: LessonWithStudents | undefined) {
    e.preventDefault();
    if (!lesson) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const hour = Math.min(DAY_END - 1, Math.max(DAY_START, DAY_START + Math.floor(offset / HOUR_PX)));
    const target = new Date(weekStart);
    target.setDate(weekStart.getDate() + dayIdx);
    target.setHours(hour, 0, 0, 0);
    setBusy(true);
    try {
      const res = await updateLesson(lesson.id, {
        scheduledAt: target.toISOString(),
        durationMin: lesson.duration_min,
        locationType: lesson.location_type,
        notes: lesson.notes ?? undefined,
      });
      if (res.ok) { toast.success(labels.dialog.saved); router.refresh(); }
      else toast.error(`${labels.dialog.saveError}: ${res.error ?? ""}`);
    } catch {
      toast.error(labels.dialog.saveError);
    } finally {
      setBusy(false);
    }
  }

  const byId = new Map(lessons.map((l) => [l.id, l]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => gotoWeek(-7)}>←</Button>
        <Button variant="outline" size="sm" onClick={gotoToday}>{labels.today}</Button>
        <Button variant="outline" size="sm" onClick={() => gotoWeek(7)}>→</Button>
        <span className="ml-2 font-semibold">
          {formatDate(dayDates[0])} — {formatDate(dayDates[6])}
        </span>
      </div>

      {students.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          {labels.noStudents}
        </p>
      )}

      <div ref={scrollRef} className="overflow-x-auto overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div className="sticky top-0 z-20 border-b border-border bg-card" />
          {dayDates.map((d, i) => (
            <div key={i} className="sticky top-0 z-20 border-b border-l border-border bg-card p-2 text-center text-sm font-semibold">
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
              <div key={dayIdx} className="relative border-l border-border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, dayIdx, byId.get(e.dataTransfer.getData("lessonId")))}>
                {HOURS.map((h) => (
                  <button key={h} type="button" onClick={() => openCreate(dayIdx, h)}
                    className="block w-full border-b border-border transition-colors hover:bg-secondary/50"
                    style={{ height: HOUR_PX }} aria-label={`${DAY_NAMES[dayIdx]} ${h}:00`} />
                ))}
                <div className="pointer-events-none absolute inset-0">
                  {dayLessons.map((l) => {
                    const start = new Date(l.scheduled_at);
                    const minutes = start.getHours() * 60 + start.getMinutes() - DAY_START * 60;
                    const totalPx = HOURS.length * HOUR_PX;
                    let top = (minutes / 60) * HOUR_PX;
                    let height = (l.duration_min / 60) * HOUR_PX - 2;
                    if (top < 0) { height += top; top = 0; } // trim the part before DAY_START
                    top = Math.min(top, totalPx - MIN_CARD_PX);
                    height = Math.max(MIN_CARD_PX, Math.min(height, totalPx - top));
                    const cancelled = l.status === "cancelled";
                    const completed = l.status === "completed";
                    const title = l.type === "group" ? `${labels.group} (${l.students.length})` : (l.students[0]?.name ?? "—");
                    return (
                      <div key={l.id}
                        draggable={!busy && !cancelled}
                        onDragStart={(e) => e.dataTransfer.setData("lessonId", l.id)}
                        onClick={() => openEdit(l)}
                        className={`pointer-events-auto absolute left-1 right-1 cursor-pointer overflow-hidden rounded-lg border px-2 py-1 text-left text-xs leading-tight shadow-sm transition ${
                          cancelled
                            ? "border-border bg-muted text-muted-foreground line-through"
                            : completed
                              ? "border-border bg-secondary text-muted-foreground"
                              : "border-primary/30 bg-accent text-accent-foreground"
                        }`}
                        style={{ top, height }}>
                        {!cancelled && (
                          <button type="button" role="checkbox" aria-checked={completed}
                            aria-label={labels.dialog.complete} title={labels.dialog.complete}
                            disabled={busy}
                            onClick={(e) => { e.stopPropagation(); toggleComplete(l); }}
                            className={`absolute right-1 top-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs transition ${
                              completed
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-primary/50 bg-card text-transparent hover:text-primary/60"
                            }`}>
                            ✓
                          </button>
                        )}
                        <div className="truncate pr-6">
                          <span className="font-semibold tabular-nums">
                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {" · "}{title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LessonDialog state={dialog} onClose={() => setDialog(null)} students={students}
        labels={labels.dialog} onOpenJournal={setJournalFor} />
      <JournalDialog lesson={journalFor} onClose={() => setJournalFor(null)} labels={labels.journal} />
    </div>
  );
}
