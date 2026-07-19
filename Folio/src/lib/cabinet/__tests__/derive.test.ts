import { describe, it, expect } from "vitest";
import { splitAssignments, partitionLessons, type CabAssignment, type CabLesson } from "../derive";

const asg = (id: string, status: string): CabAssignment => ({
  id, topic: "T", level: "B1", moduleType: "READING_MODULE", content: "c",
  status, dueDate: null, tutorComment: null, submittedAt: null, items: [], inlineAnswers: null,
});

describe("splitAssignments", () => {
  it("puts assigned/submitted/returned into current, accepted into completed", () => {
    const { current, completed } = splitAssignments([
      asg("1", "assigned"), asg("2", "submitted"), asg("3", "returned"), asg("4", "accepted"),
    ]);
    expect(current.map((a) => a.id)).toEqual(["1", "2", "3"]);
    expect(completed.map((a) => a.id)).toEqual(["4"]);
  });

  it("treats legacy 'reviewed' as completed", () => {
    const { current, completed } = splitAssignments([asg("1", "reviewed")]);
    expect(current).toEqual([]);
    expect(completed.map((a) => a.id)).toEqual(["1"]);
  });

  it("handles empty input", () => {
    expect(splitAssignments([])).toEqual({ current: [], completed: [] });
  });
});

const lsn = (id: string, iso: string, status = "scheduled"): CabLesson => ({
  id, scheduledAt: iso, durationMin: 60, type: "solo", locationType: "online", status,
});

describe("partitionLessons", () => {
  const now = "2026-07-01T12:00:00.000Z";

  it("splits upcoming (asc) from recent past (desc), drops cancelled, caps past", () => {
    const { upcoming, recentPast } = partitionLessons([
      lsn("future2", "2026-07-03T10:00:00Z"),
      lsn("future1", "2026-07-02T10:00:00Z"),
      lsn("past1", "2026-06-30T10:00:00Z"),
      lsn("past2", "2026-06-29T10:00:00Z"),
      lsn("past3", "2026-06-28T10:00:00Z"),
      lsn("cancelled", "2026-07-02T09:00:00Z", "cancelled"),
    ], now, 2);
    expect(upcoming.map((l) => l.id)).toEqual(["future1", "future2"]); // ascending, no cancelled
    expect(recentPast.map((l) => l.id)).toEqual(["past1", "past2"]);   // most recent first, capped at 2
  });

  it("returns empties when nothing matches", () => {
    expect(partitionLessons([], now)).toEqual({ upcoming: [], recentPast: [] });
  });
});
