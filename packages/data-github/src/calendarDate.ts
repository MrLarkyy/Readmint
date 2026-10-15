// Calendar dates are `YYYY-MM-DD` strings handled with UTC arithmetic only: local-time Date
// methods would make the result depend on the process timezone.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** True for a real calendar day in `YYYY-MM-DD` form. */
export function isCalendarDate(text: string): boolean {
  return toUtcMs(text) !== null;
}

/** The following day; the input must satisfy `isCalendarDate`. */
export function nextDate(date: string): string {
  return formatUtc(requireUtcMs(date) + DAY_MS);
}

/** The day `days` days after `date` (before it when negative); the input must satisfy `isCalendarDate`. */
export function addDays(date: string, days: number): string {
  return formatUtc(requireUtcMs(date) + days * DAY_MS);
}

/** 0 = Sunday to 6 = Saturday; the input must satisfy `isCalendarDate`. */
export function weekdayOf(date: string): number {
  return new Date(requireUtcMs(date)).getUTCDay();
}

function toUtcMs(text: string): number | null {
  const match = DATE_PATTERN.exec(text);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const value = new Date(0);
  // setUTCFullYear, unlike Date.UTC, does not map years 0-99 onto 1900-1999.
  value.setUTCFullYear(year, month - 1, day);
  const ms = value.getTime();
  return formatUtc(ms) === text ? ms : null;
}

function requireUtcMs(date: string): number {
  const ms = toUtcMs(date);
  if (ms === null) throw new RangeError("not a YYYY-MM-DD calendar date");
  return ms;
}

function formatUtc(ms: number): string {
  const value = new Date(ms);
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
