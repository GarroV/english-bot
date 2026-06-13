import { describe, it, expect } from "vitest";
import { homeworkInputSchema } from "../schema";

const base = { moduleType: "READING_MODULE" as const, topic: "London transport", level: "B1", ageGroup: "adult" };

describe("homeworkInputSchema", () => {
  it("accepts a valid reading input", () => {
    expect(homeworkInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects empty topic", () => {
    expect(homeworkInputSchema.safeParse({ ...base, topic: "  " }).success).toBe(false);
  });
  it("rejects unknown module type", () => {
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "ESSAY" }).success).toBe(false);
  });
  it("requires verb for VERB_SENTENCES", () => {
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "VERB_SENTENCES" }).success).toBe(false);
    expect(homeworkInputSchema.safeParse({ ...base, moduleType: "VERB_SENTENCES", verb: "must / have to" }).success).toBe(true);
  });
});
