import type { LocaleData } from "./LocaleData.js";

/** From here on `toFixed` gives exponent notation; such numbers are written as `String(n)`. */
const exponentThreshold = 1e21;

/**
 * `value` rounded to `decimals` fraction digits by `toFixed` (exact on the binary value, half away
 * from zero, the same in every engine) and written with the locale's separators. `-0` and values
 * that round to zero carry no sign.
 */
export function formatNumber(value: number, decimals: number, locale: LocaleData): string {
  if (Math.abs(value) >= exponentThreshold) return String(value);
  return localize(value.toFixed(decimals), locale);
}

/** A percentage: `value` 0.25 is `25%`. */
export function formatPercent(value: number, decimals: number, locale: LocaleData): string {
  const scaled = value * 100;
  const digits =
    Math.abs(scaled) >= exponentThreshold
      ? String(scaled)
      : localize(scaled.toFixed(decimals), locale);
  return digits + locale.percentSuffix;
}

/**
 * A short form: thousands, millions, billions and trillions with the locale's suffix, at most
 * `decimals` fraction digits and no trailing zeros. A value that rounds up to 1000 of a unit moves
 * to the next unit (999950 is `1M`, not `1000K`).
 */
/** 1000 to the power of the unit, written out: `**` is only approximated by the ECMAScript spec. */
const unitSizes: readonly number[] = [1, 1e3, 1e6, 1e9, 1e12];

export function formatCompact(value: number, decimals: number, locale: LocaleData): string {
  if (Math.abs(value) >= exponentThreshold) return String(value);
  const magnitude = Math.abs(value);
  let unit = 0;
  while (unit < 4 && magnitude >= (unitSizes[unit + 1] ?? Infinity)) unit++;
  let fixed = trimZeros(scale(magnitude, unit).toFixed(decimals));
  if (unit < 4 && Number(fixed) >= 1000) {
    unit++;
    fixed = trimZeros(scale(magnitude, unit).toFixed(decimals));
  }
  const sign = value < 0 && !isZero(fixed) ? "-" : "";
  const suffix = unit === 0 ? "" : (locale.compactSuffixes[unit - 1] ?? "");
  return sign + localize(fixed, locale) + suffix;
}

function scale(magnitude: number, unit: number): number {
  return unit === 0 ? magnitude : magnitude / (unitSizes[unit] ?? 1);
}

/** Writes the output of `toFixed` with the locale's decimal and group separators. */
function localize(fixed: string, locale: LocaleData): string {
  const negative = fixed.startsWith("-");
  const digits = negative ? fixed.slice(1) : fixed;
  const point = digits.indexOf(".");
  const integer = point === -1 ? digits : digits.slice(0, point);
  const fraction = point === -1 ? "" : digits.slice(point + 1);
  const sign = negative && !isZero(digits) ? "-" : "";
  return sign + group(integer, locale) + (fraction === "" ? "" : locale.decimal + fraction);
}

function group(integer: string, locale: LocaleData): string {
  if (integer.length < 3 + locale.minimumGroupingDigits) return integer;
  const head = integer.length % 3 || 3;
  let grouped = integer.slice(0, head);
  for (let index = head; index < integer.length; index += 3) {
    grouped += locale.group + integer.slice(index, index + 3);
  }
  return grouped;
}

function trimZeros(fixed: string): string {
  if (!fixed.includes(".")) return fixed;
  let end = fixed.length;
  while (fixed.charAt(end - 1) === "0") end--;
  if (fixed.charAt(end - 1) === ".") end--;
  return fixed.slice(0, end);
}

function isZero(digits: string): boolean {
  for (const char of digits) {
    if (char !== "0" && char !== "." && char !== "-") return false;
  }
  return true;
}
