import { daysFromCivil, daysInMonth } from "./civilDays.js";
import type { ExprValue } from "./ExprValue.js";

const msPerMinute = 60_000;
const msPerDay = 86_400_000;
/** 0000-01-01T00:00:00.000Z and 9999-12-31T23:59:59.999Z: the supported range. */
export const minDateMs = daysFromCivil(0, 1, 1) * msPerDay;
export const maxDateMs = daysFromCivil(10_000, 1, 1) * msPerDay - 1;
/** Longest accepted ISO text: `YYYY-MM-DDTHH:mm:ss.fffffffff+HH:mm`. */
const maxIsoLength = 35;

/**
 * Milliseconds since the epoch (UTC) of an ISO 8601 date (`YYYY-MM-DD`, optionally
 * `THH:mm[:ss[.f]]` with 1 to 9 fraction digits, then `Z`, `±HH:mm` or nothing for UTC) or of an
 * integer number of epoch milliseconds; `undefined` when invalid or outside years 0000 to 9999.
 * An own scanner, never `Date.parse`, whose accepted forms differ between engines.
 */
export function parseDate(value: ExprValue): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= minDateMs && value <= maxDateMs ? value : undefined;
  }
  if (typeof value !== "string" || value.length > maxIsoLength) return undefined;
  const scanner = new Scanner(value);
  const year = scanner.digits(4);
  const month = scanner.literal("-") ? scanner.digits(2) : undefined;
  const day = scanner.literal("-") ? scanner.digits(2) : undefined;
  if (year === undefined || month === undefined || day === undefined) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  let ms = daysFromCivil(year, month, day) * msPerDay;
  if (scanner.literal("T")) {
    const time = scanTime(scanner);
    if (time === undefined) return undefined;
    ms += time;
  }
  if (!scanner.atEnd()) return undefined;
  return ms >= minDateMs && ms <= maxDateMs ? ms : undefined;
}

/** Time of day plus zone, as milliseconds to add to midnight UTC of the date. */
function scanTime(scanner: Scanner): number | undefined {
  const hour = scanner.digits(2);
  const minute = scanner.literal(":") ? scanner.digits(2) : undefined;
  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) return undefined;
  let second = 0;
  let fraction = 0;
  if (scanner.literal(":")) {
    const seconds = scanner.digits(2);
    if (seconds === undefined || seconds > 59) return undefined;
    second = seconds;
    if (scanner.literal(".")) {
      const digits = scanner.digitRun(1, 9);
      if (digits === undefined) return undefined;
      fraction = Number(digits.padEnd(3, "0").slice(0, 3));
    }
  }
  let offset = 0;
  if (!scanner.literal("Z")) {
    const sign = scanner.literal("+") ? 1 : scanner.literal("-") ? -1 : 0;
    if (sign !== 0) {
      const offsetHour = scanner.digits(2);
      const offsetMinute = scanner.literal(":") ? scanner.digits(2) : undefined;
      if (offsetHour === undefined || offsetMinute === undefined) return undefined;
      if (offsetHour > 23 || offsetMinute > 59) return undefined;
      offset = sign * (offsetHour * 60 + offsetMinute) * msPerMinute;
    }
  }
  return ((hour * 60 + minute) * 60 + second) * 1000 + fraction - offset;
}

class Scanner {
  private position = 0;

  constructor(private readonly text: string) {}

  literal(char: string): boolean {
    if (this.text.charAt(this.position) !== char) return false;
    this.position++;
    return true;
  }

  digits(count: number): number | undefined {
    const run = this.digitRun(count, count);
    return run === undefined ? undefined : Number(run);
  }

  digitRun(min: number, max: number): string | undefined {
    let end = this.position;
    while (end - this.position < max && isDigit(this.text.charCodeAt(end))) end++;
    if (end - this.position < min) return undefined;
    const run = this.text.slice(this.position, end);
    this.position = end;
    return run;
  }

  atEnd(): boolean {
    return this.position === this.text.length;
  }
}

function isDigit(unit: number): boolean {
  return unit >= 0x30 && unit <= 0x39;
}
