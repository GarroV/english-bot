// Pure shaping for the student cabinet — no I/O, unit-tested independently of Supabase.

// One itemized question of a live-doc assignment (live-doc Ф1b). Answer is editable by the student
// while the assignment is 'assigned' or 'returned'; tutorComment is read-only here (written by the tutor).
export interface CabItem {
  id: string;
  idx: number;
  taskLabel: string | null;
  questionText: string;
  itemType: string; // tf | mcq | open | gap | other
  studentAnswer: string | null;
  tutorComment: string | null;
}

export interface CabAssignment {
  id: string;
  topic: string;
  level: string | null;
  moduleType: string;
  content: string;
  status: string; // assigned | submitted | returned | accepted (legacy: reviewed)
  dueDate: string | null;
  tutorComment: string | null;
  submittedAt: string | null;
  inlineAnswers: Record<string, string> | null; // ответы в пропусках текста (#56); ключ = номер/"free"
  items: CabItem[]; // legacy itemized questions (UI больше не рендерит — заменены инлайн-ответами)
}

export interface CabLesson {
  id: string;
  scheduledAt: string;
  durationMin: number;
  type: "solo" | "group"; // NB: never carries co-student names (group privacy)
  locationType: "online" | "offline";
  status: string; // scheduled | completed | cancelled
}

// Current = still in the review cycle (assigned | submitted | returned).
// Completed = accepted (terminal). Legacy 'reviewed' rows (pre-Ф2 terminal) also count as completed
// in case any survived the status migration.
export function splitAssignments(rows: CabAssignment[]): { current: CabAssignment[]; completed: CabAssignment[] } {
  const current = new Set(["assigned", "submitted", "returned"]);
  const completed = new Set(["accepted", "reviewed"]);
  return {
    current: rows.filter((r) => current.has(r.status)),
    completed: rows.filter((r) => completed.has(r.status)),
  };
}

// Upcoming (ascending) + a few most-recent past lessons (descending). Cancelled lessons are dropped.
export function partitionLessons(
  rows: CabLesson[],
  nowISO: string,
  pastLimit = 2,
): { upcoming: CabLesson[]; recentPast: CabLesson[] } {
  const now = Date.parse(nowISO);
  const active = rows.filter((l) => l.status !== "cancelled");
  const upcoming = active
    .filter((l) => Date.parse(l.scheduledAt) >= now)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const recentPast = active
    .filter((l) => Date.parse(l.scheduledAt) < now)
    .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt))
    .slice(0, pastLimit);
  return { upcoming, recentPast };
}
