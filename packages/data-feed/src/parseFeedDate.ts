const MAX_DATE_LENGTH = 64;
const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*([Zz]|[+-]\d{2}:?\d{2})?$/;
const RFC_822 =
  /^(?:[A-Za-z]{2,9},?\s*)?(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4}|\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,5})?$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// A Map, not an object: a zone such as `constructor` must not find a prototype member.
const ZONE_HOURS: ReadonlyMap<string, number> = new Map([
  ["ut", 0],
  ["utc", 0],
  ["gmt", 0],
  ["z", 0],
  ["est", -5],
  ["edt", -4],
  ["cst", -6],
  ["cdt", -5],
  ["mst", -7],
  ["mdt", -6],
  ["pst", -8],
  ["pdt", -7],
]);
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly offsetMinutes: number;
}

/**
 * A feed date as UTC ISO 8601 (`toISOString`), or `null`: RFC 3339 (Atom, `dc:date`; a date
 * alone is midnight UTC) or RFC 822/1123 (RSS `pubDate`; no zone is UTC, two-digit years per RFC
 * 2822). Parsed by hand and computed with `Date.UTC`, never `Date.parse`, whose leniency differs
 * between engines: the same feed gives the same data in Node and every browser. Fields out of
 * range, an unknown zone and years outside 1970 to 9999 (after the offset) are `null`.
 */
export function parseFeedDate(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > MAX_DATE_LENGTH) return null;
  const parts = rfc3339(trimmed) ?? rfc822(trimmed);
  return parts === null ? null : toIso(parts);
}

function rfc3339(text: string): DateParts | null {
  const match = RFC_3339.exec(text);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const offsetMinutes = zone === undefined ? 0 : numericOffset(zone);
  if (offsetMinutes === null) return null;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour ?? "0"),
    minute: Number(minute ?? "0"),
    second: Number(second ?? "0"),
    millisecond: Number((fraction ?? "").padEnd(3, "0").slice(0, 3)),
    offsetMinutes,
  };
}

function rfc822(text: string): DateParts | null {
  const match = RFC_822.exec(text);
  if (match === null) return null;
  const [, day, monthName, yearText, hour, minute, second, zone] = match;
  const month = MONTHS.indexOf((monthName ?? "").slice(0, 3).toLowerCase()) + 1;
  if (month === 0) return null;
  let year = Number(yearText);
  if (yearText?.length === 2) year += year < 50 ? 2000 : 1900;
  let offsetMinutes: number | null = 0;
  if (zone !== undefined) {
    const hours = ZONE_HOURS.get(zone.toLowerCase());
    offsetMinutes = /^[+-]/.test(zone)
      ? numericOffset(zone)
      : hours === undefined
        ? null
        : hours * 60;
  }
  if (offsetMinutes === null) return null;
  return {
    year,
    month,
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? "0"),
    millisecond: 0,
    offsetMinutes,
  };
}

/** `Z`, `+hh:mm` or `+hhmm` in minutes east of UTC; `null` when out of range. */
function numericOffset(zone: string): number | null {
  if (zone === "Z" || zone === "z") return 0;
  const digits = zone.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 23 || minutes > 59) return null;
  return (zone.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
}

function toIso(parts: DateParts): string | null {
  const { year, month, day, hour, minute, second } = parts;
  if (year < MIN_YEAR - 1 || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  // 60 is a leap second; it rolls over into the next minute.
  if (hour > 23 || minute > 59 || second > 60) return null;
  const epoch =
    Date.UTC(year, month - 1, day, hour, minute, second, parts.millisecond) -
    parts.offsetMinutes * 60_000;
  const date = new Date(epoch);
  const utcYear = date.getUTCFullYear();
  return utcYear < MIN_YEAR || utcYear > MAX_YEAR ? null : date.toISOString();
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
