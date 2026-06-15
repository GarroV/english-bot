import { describe, it, expect } from "vitest";
import { assignInputSchema, assignmentStatusSchema } from "../assignments-schema";

const T = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-9222-222222222222";

describe("assignInputSchema", () => {
  it("accepts a valid assignment", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S] }).success).toBe(true);
  });
  it("accepts an optional due date", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S], dueDate: "2026-07-01" }).success).toBe(true);
  });
  it("rejects empty studentIds", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [] }).success).toBe(false);
  });
  it("rejects a non-uuid templateId", () => {
    expect(assignInputSchema.safeParse({ templateId: "nope", studentIds: [S] }).success).toBe(false);
  });
  it("rejects a malformed due date", () => {
    expect(assignInputSchema.safeParse({ templateId: T, studentIds: [S], dueDate: "2026/07/01" }).success).toBe(false);
  });
});

describe("assignmentStatusSchema", () => {
  it("accepts known statuses", () => {
    expect(assignmentStatusSchema.safeParse("submitted").success).toBe(true);
  });
  it("rejects unknown status", () => {
    expect(assignmentStatusSchema.safeParse("done").success).toBe(false);
  });
});
