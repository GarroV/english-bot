import { describe, it, expect } from "vitest";
import { journalInputSchema } from "./schema";

describe("journalInputSchema", () => {
  it("accepts an entry with at least one field", () => {
    expect(journalInputSchema.safeParse({ comment: "разобрали Past Simple" }).success).toBe(true);
    expect(journalInputSchema.safeParse({ level: "B1" }).success).toBe(true);
  });

  it("rejects a fully-empty entry", () => {
    expect(journalInputSchema.safeParse({}).success).toBe(false);
    expect(journalInputSchema.safeParse({ topic: "", comment: "   " }).success).toBe(false);
  });

  it("rejects an invalid CEFR level", () => {
    expect(journalInputSchema.safeParse({ level: "Z9" }).success).toBe(false);
  });

  it("trims string fields", () => {
    const r = journalInputSchema.safeParse({ topic: "  Past Simple  " });
    expect(r.success && r.data.topic).toBe("Past Simple");
  });
});
