import { civilFromDays } from "./civilDays.js";
import type { LocaleData } from "./LocaleData.js";

const msPerDay = 86_400_000;

/** Pattern letters and the run lengths each accepts. */
const fieldLengths: ReadonlyMap<string, readonly number[]> = new Map([
  ["y", [2, 4]],
  ["M", [1, 2, 3, 4]],
  ["d", [1, 2]],
  ["E", [3, 4]],
  ["H", [1, 2]],
  ["h", [1, 2]],
  ["a", [1]],
  ["m", [1, 2]],
  ["s", [1, 2]],
]);

/**
 * Writes the UTC date and time of `epochMs` with `pattern`: `yyyy yy M MM MMM MMMM d dd EEE EEEE
 * H HH h hh a m mm s ss`, `'quoted text'` and `''` for a quote; any other ASCII letter is invalid
 * (`undefined`) so a later field letter cannot silently change an old pattern's meaning.
 */
export function formatDate(
  epochMs: number,
  pattern: string,
  locale: LocaleData,
): string | undefined {
  const days = Math.floor(epochMs / msPerDay);
  const msOfDay = epochMs - days * msPerDay;
  const date = civilFromDays(days);
  const fields = {
    ...date,
    weekday: (((days + 4) % 7) + 7) % 7,
    hour: Math.floor(msOfDay / 3_600_000),
    minute: Math.floor(msOfDay / 60_000) % 60,
    second: Math.floor(msOfDay / 1000) % 60,
  };
  let output = "";
  let index = 0;
  while (index < pattern.length) {
    const char = pattern.charAt(index);
    if (char === "'") {
      const quoted = readQuoted(pattern, index);
      if (quoted === undefined) return undefined;
      output += quoted.text;
      index = quoted.end;
      continue;
    }
    if (!isAsciiLetter(char)) {
      output += char;
      index++;
      continue;
    }
    let end = index + 1;
    while (pattern.charAt(end) === char) end++;
    const length = end - index;
    if (!(fieldLengths.get(char)?.includes(length) ?? false)) return undefined;
    output += writeField(char, length, fields, locale);
    index = end;
  }
  return output;
}

interface Fields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function writeField(letter: string, length: number, fields: Fields, locale: LocaleData): string {
  switch (letter) {
    case "y":
      return length === 2 ? pad(fields.year % 100, 2) : pad(fields.year, 4);
    case "M":
      if (length === 3) return locale.monthsShort[fields.month - 1] ?? "";
      if (length === 4) return locale.monthsLong[fields.month - 1] ?? "";
      return pad(fields.month, length);
    case "d":
      return pad(fields.day, length);
    case "E":
      return (length === 3 ? locale.weekdaysShort : locale.weekdaysLong)[fields.weekday] ?? "";
    case "H":
      return pad(fields.hour, length);
    case "h":
      return pad(fields.hour % 12 === 0 ? 12 : fields.hour % 12, length);
    case "a":
      return locale.dayPeriods[fields.hour < 12 ? 0 : 1];
    case "m":
      return pad(fields.minute, length);
    default:
      return pad(fields.second, length);
  }
}

/** `''` is one quote; `'text'` is literal text in which `''` is a quote. */
function readQuoted(pattern: string, start: number): { text: string; end: number } | undefined {
  if (pattern.charAt(start + 1) === "'") return { text: "'", end: start + 2 };
  let text = "";
  let index = start + 1;
  while (index < pattern.length) {
    const char = pattern.charAt(index);
    if (char === "'") {
      if (pattern.charAt(index + 1) !== "'") return { text, end: index + 1 };
      text += "'";
      index += 2;
    } else {
      text += char;
      index++;
    }
  }
  return undefined;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function isAsciiLetter(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z");
}
