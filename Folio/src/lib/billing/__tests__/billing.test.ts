import { describe, it, expect } from "vitest";
import { chargeAmount } from "../amount";
import { paymentInputSchema, chargeInputSchema } from "../schema";

const S = "11111111-1111-4111-8111-111111111111";

describe("chargeAmount", () => {
  it("uses the override when present", () => { expect(chargeAmount(150, 100)).toBe(150); });
  it("falls back to the default rate", () => { expect(chargeAmount(null, 100)).toBe(100); });
  it("is 0 when neither is set", () => { expect(chargeAmount(null, null)).toBe(0); });
});

describe("paymentInputSchema", () => {
  it("accepts a positive amount", () => {
    expect(paymentInputSchema.safeParse({ studentId: S, amount: 500 }).success).toBe(true);
  });
  it("rejects zero/negative", () => {
    expect(paymentInputSchema.safeParse({ studentId: S, amount: 0 }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ studentId: S, amount: -5 }).success).toBe(false);
  });
  it("rejects a non-uuid student", () => {
    expect(paymentInputSchema.safeParse({ studentId: "x", amount: 500 }).success).toBe(false);
  });
});

describe("chargeInputSchema", () => {
  it("accepts extra charge and discount with positive amount", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 500, kind: "extra", note: "учебник" }).success).toBe(true);
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 200, kind: "discount" }).success).toBe(true);
  });
  it("rejects zero/negative (sign is set by server, not form)", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 0, kind: "extra" }).success).toBe(false);
    expect(chargeInputSchema.safeParse({ studentId: S, amount: -5, kind: "discount" }).success).toBe(false);
  });
  it("rejects unknown kind", () => {
    expect(chargeInputSchema.safeParse({ studentId: S, amount: 5, kind: "bonus" }).success).toBe(false);
  });
});
