import { plainText } from "./plainText.js";
import type { WakaTimeEntry } from "./WakaTimeData.js";
import { WakaTimeShapeError } from "./WakaTimeShapeError.js";
import { WakaTimeLimits } from "./WakaTimeSourceOptions.js";

/**
 * A list of `{ name, <secondsKey>, percent }` objects (`total_seconds` in a WakaTime answer, `seconds` in a cache entry)
 * as entries: names made plain text and capped, empty names dropped, seconds whole, percent two decimals; most time
 * first, then by name in code-unit order (never the locale's), at most 20, frozen. Only the three fields are read; an
 * absent list is empty.
 */
export function wakaTimeEntries(
  value: unknown,
  field: string,
  secondsKey: "total_seconds" | "seconds",
): readonly WakaTimeEntry[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new WakaTimeShapeError(`${field} is not a list`);
  const entries: WakaTimeEntry[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new WakaTimeShapeError(`an entry of ${field} is not an object`);
    }
    const rawName = own(item, "name");
    if (typeof rawName !== "string")
      throw new WakaTimeShapeError(`an entry of ${field} has no name`);
    const name = plainText(rawName, WakaTimeLimits.nameLength);
    const seconds = Math.round(amount(own(item, secondsKey), `${field} seconds`));
    const percent = Math.round(amount(own(item, "percent"), `${field} percent`) * 100) / 100;
    if (name !== "") entries.push(Object.freeze({ name, percent, seconds }));
  }
  entries.sort(byTime);
  return Object.freeze(entries.slice(0, WakaTimeLimits.maxEntries));
}

/** A finite, non-negative number, else a shape error naming `what`. */
export function amount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new WakaTimeShapeError(`${what} is not a non-negative number`);
  }
  return value;
}

/** An own property only: a `__proto__` or inherited key of the answer is never read. */
export function own(record: object, key: string): unknown {
  return Object.hasOwn(record, key) ? (record as Record<string, unknown>)[key] : undefined;
}

function byTime(a: WakaTimeEntry, b: WakaTimeEntry): number {
  if (a.seconds !== b.seconds) return b.seconds - a.seconds;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
