// Charge for one student on a completed lesson: per-lesson override wins, else the
// student's default rate, else 0 (no rate set — visible so the tutor can correct).
export function chargeAmount(rateOverride: number | null, defaultRate: number | null): number {
  return rateOverride ?? defaultRate ?? 0;
}
