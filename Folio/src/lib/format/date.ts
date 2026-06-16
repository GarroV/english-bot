// Format a date as дд.мм.гг (e.g. 16.06.26). Deterministic — no locale dependency,
// so server and client render identically (avoids React hydration mismatches that
// `Date.toLocaleDateString()` with no explicit locale can cause).
export function formatDate(value: string | Date): string {
  // Date-only strings ("YYYY-MM-DD", e.g. a Postgres `date` column) are formatted
  // directly — parsing them via `new Date` interprets them as UTC midnight and can
  // shift the day by one in negative-offset timezones.
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return `${m[3]}.${m[2]}.${m[1].slice(2)}`;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${dd}.${mm}.${yy}`;
}
