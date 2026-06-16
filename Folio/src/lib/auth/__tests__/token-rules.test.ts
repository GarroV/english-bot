import { describe, it, expect } from "vitest";
import { isRedeemable, type LoginTokenRow } from "../token-rules";

const base: LoginTokenRow = {
  status: "confirmed",
  expires_at: "2999-01-01T00:00:00Z",
  consumed_at: null,
  folio_user_id: "u1",
  signup_invite_id: null,
};

describe("isRedeemable", () => {
  it("true for confirmed, unexpired, unconsumed with a user", () => {
    expect(isRedeemable(base, Date.parse("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("true for a registration token (signup invite, no user yet)", () => {
    expect(isRedeemable(
      { ...base, folio_user_id: null, signup_invite_id: "inv1" },
      Date.parse("2026-01-01T00:00:00Z"),
    )).toBe(true);
  });
  it("false when pending", () => {
    expect(isRedeemable({ ...base, status: "pending" }, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });
  it("false when already consumed", () => {
    expect(isRedeemable({ ...base, consumed_at: "2026-01-01T00:00:00Z" }, Date.parse("2026-01-02T00:00:00Z"))).toBe(false);
  });
  it("false when expired", () => {
    expect(isRedeemable({ ...base, expires_at: "2026-01-01T00:00:00Z" }, Date.parse("2026-06-01T00:00:00Z"))).toBe(false);
  });
  it("false when neither user nor signup invite linked", () => {
    expect(isRedeemable(
      { ...base, folio_user_id: null, signup_invite_id: null },
      Date.parse("2026-01-01T00:00:00Z"),
    )).toBe(false);
  });
});
