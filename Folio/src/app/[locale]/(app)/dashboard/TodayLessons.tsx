import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import type { LessonWithStudents } from "@/lib/lessons/queries";

export interface TodayLessonsLabels {
  todayLessons: string;
  openSchedule: string;
  noLessonsToday: string;
  now: string;
  group: string;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function isNow(lesson: LessonWithStudents, nowISO: string): boolean {
  const start = new Date(lesson.scheduled_at).getTime();
  const end = start + lesson.duration_min * 60_000;
  const now = new Date(nowISO).getTime();
  return now >= start && now <= end;
}

// Left column: today's lessons. The header is a link into the full schedule.
export function TodayLessons({
  lessons, nowISO, labels,
}: {
  lessons: LessonWithStudents[];
  nowISO: string;
  labels: TodayLessonsLabels;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Link
          href="/schedule"
          title={labels.openSchedule}
          className="group flex items-center gap-2 text-sm font-bold transition-colors hover:text-primary"
        >
          {labels.todayLessons}
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
        </Link>
        {lessons.length > 0 && (
          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">{lessons.length}</span>
        )}
      </div>

      {lessons.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{labels.noLessonsToday}</p>
      ) : (
        <ul>
          {lessons.map((l) => {
            const name = l.type === "group" ? `${labels.group} (${l.students.length})` : (l.students[0]?.name ?? "—");
            return (
              <li key={l.id} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
                <span className={`h-2 w-2 flex-none rounded-full ${l.type === "group" ? "bg-amber-500" : "bg-primary"}`} aria-hidden />
                <span className="w-11 flex-none font-semibold tabular-nums">{hhmm(l.scheduled_at)}</span>
                <span className="min-w-0 truncate text-sm font-medium">{name}</span>
                {isNow(l, nowISO) && (
                  <span className="ml-auto flex-none rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">{labels.now}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
