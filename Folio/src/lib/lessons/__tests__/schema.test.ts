import { describe, it, expect } from "vitest";
import { lessonInputSchema, lessonTypeFor } from "../schema";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-9222-222222222222";
const valid = {
  scheduledAt: "2026-06-15T10:00:00.000Z",
  durationMin: 60,
  locationType: "online" as const,
  studentIds: [S1],
};

describe("lessonInputSchema", () => {
  it("accepts a valid solo lesson", () => {
    expect(lessonInputSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts multiple students (group)", () => {
    expect(lessonInputSchema.safeParse({ ...valid, studentIds: [S1, S2] }).success).toBe(true);
  });
  it("rejects non-uuid student ids", () => {
    expect(lessonInputSchema.safeParse({ ...valid, studentIds: ["nope"] }).success).toBe(false);
  });
  it("rejects empty studentIds", () => {
    expect(lessonInputSchema.safeParse({ ...valid, studentIds: [] }).success).toBe(false);
  });
  it("rejects non-positive duration", () => {
    expect(lessonInputSchema.safeParse({ ...valid, durationMin: 0 }).success).toBe(false);
  });
  it("rejects bad location", () => {
    expect(lessonInputSchema.safeParse({ ...valid, locationType: "zoom" }).success).toBe(false);
  });
});

describe("lessonTypeFor", () => {
  it("solo for one student", () => { expect(lessonTypeFor(["a"])).toBe("solo"); });
  it("group for two+", () => { expect(lessonTypeFor(["a", "b"])).toBe("group"); });
});
