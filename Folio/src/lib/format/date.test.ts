import { describe, it, expect } from "vitest";
import { formatDate } from "./date";

describe("formatDate", () => {
  it("formats a date-only string as дд.мм.гг with no timezone shift", () => {
    expect(formatDate("2026-07-01")).toBe("01.07.26");
    expect(formatDate("2026-12-31")).toBe("31.12.26");
  });

  it("pads single-digit day and month", () => {
    expect(formatDate("2026-01-05")).toBe("05.01.26");
  });

  it("formats a Date object using local components", () => {
    expect(formatDate(new Date(2026, 5, 9))).toBe("09.06.26"); // month 5 = June
  });

  it("returns a dash for an invalid date", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});
