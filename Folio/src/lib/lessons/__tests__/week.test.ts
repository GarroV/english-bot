import { describe, it, expect } from "vitest";
import { startOfWeek, weekRange, toDatetimeLocal } from "../week";

describe("startOfWeek", () => {
  it("returns the Monday for a mid-week date", () => {
    const mon = startOfWeek(new Date("2026-06-12T15:00:00"));
    expect(mon.getDay()).toBe(1);
    expect(mon.getHours()).toBe(0);
  });
  it("returns the Monday itself for a Monday", () => {
    const mon = startOfWeek(new Date("2026-06-08T09:00:00"));
    expect(mon.getDay()).toBe(1);
  });
  it("handles Sunday (goes back to previous Monday)", () => {
    const mon = startOfWeek(new Date("2026-06-14T09:00:00"));
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(8);
  });
});

describe("weekRange", () => {
  it("spans exactly 7 days", () => {
    const { fromISO, toISO } = weekRange(new Date("2026-06-08T00:00:00"));
    const days = (Date.parse(toISO) - Date.parse(fromISO)) / 86400000;
    expect(days).toBe(7);
  });
});

describe("toDatetimeLocal", () => {
  it("formats to YYYY-MM-DDTHH:mm", () => {
    expect(toDatetimeLocal(new Date("2026-06-15T09:05:00"))).toBe("2026-06-15T09:05");
  });
});
