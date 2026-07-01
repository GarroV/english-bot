// Pure shaping for the student cabinet — no I/O, unit-tested independently of Supabase.

export interface CabAssignment {
  id: string;
  topic: string;
  level: string | null;
  moduleType: string;
  content: string;
  status: string; // assigned | submitted | reviewed
  dueDate: string | null;
  tutorComment: string | null;
  submittedAt: string | null;
}

export interface CabLesson {
  id: string;
  scheduledAt: string;
  durationMin: number;
  type: "solo" | "group"; // NB: never carries co-student names (group privacy)
  locationType: "online" | "offline";
  status: string; // scheduled | completed | cancelled
}

// Current = still in play (assigned or submitted); Completed = reviewed by the tutor.
export function splitAssignments(rows: CabAssignment[]): { current: CabAssignment[]; completed: CabAssignment[] } {
  return {
    current: rows.filter((r) => r.status === "assigned" || r.status === "submitted"),
    completed: rows.filter((r) => r.status === "reviewed"),
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
