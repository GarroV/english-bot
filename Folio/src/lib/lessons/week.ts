// Monday 00:00 (local) of the week containing `d`.
export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// [Monday 00:00, next Monday 00:00) as ISO strings for range queries.
export function weekRange(monday: Date): { fromISO: string; toISO: string } {
  const from = new Date(monday);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

// Local Date -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">.
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DDTHH:mm" (local) -> ISO (UTC) string.
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

// "YYYY-MM-DD" (Monday param) -> Date (week's Monday), or current week's Monday if absent/invalid.
export function mondayFromParam(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(`${param}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfWeek(d);
  }
  return startOfWeek(new Date());
}

// Date -> "YYYY-MM-DD" for the ?week= param.
export function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
