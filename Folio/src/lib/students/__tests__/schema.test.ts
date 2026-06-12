import { describe, it, expect } from "vitest";
import { studentInputSchema } from "../schema";

describe("studentInputSchema", () => {
  it("accepts a minimal valid student (name only)", () => {
    expect(studentInputSchema.safeParse({ name: "Ann" }).success).toBe(true);
  });
  it("accepts full valid input", () => {
    expect(studentInputSchema.safeParse({
      name: "Ann", email: "a@b.com", telegramId: 5, defaultRate: 1500, notes: "x",
    }).success).toBe(true);
  });
  it("rejects empty name", () => {
    expect(studentInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });
  it("rejects bad email", () => {
    expect(studentInputSchema.safeParse({ name: "Ann", email: "nope" }).success).toBe(false);
  });
  it("rejects negative rate", () => {
    expect(studentInputSchema.safeParse({ name: "Ann", defaultRate: -1 }).success).toBe(false);
  });
});
