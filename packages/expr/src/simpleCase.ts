/**
 * Simple (one code point to one code point) case mappings of the Unicode Character Database for
 * Basic Latin, Latin-1 Supplement, Latin Extended-A, Greek and Coptic, and Cyrillic, as static
 * data. `String.prototype.toUpperCase` follows the engine's Unicode version, which differs between
 * Node releases and browsers; this table does not. Every other code point is left unchanged, and
 * nothing expands (`ß` stays `ß`, `İ` lowers to `i`).
 *
 * Each run is `[first, last, delta, step]`: every `step`-th code point from `first` to `last`
 * maps to itself plus `delta`.
 */
type Run = readonly [first: number, last: number, delta: number, step: number];

const upperRuns: readonly Run[] = [
  [0x0061, 0x007a, -32, 1],
  [0x00b5, 0x00b5, 743, 1],
  [0x00e0, 0x00f6, -32, 1],
  [0x00f8, 0x00fe, -32, 1],
  [0x00ff, 0x00ff, 121, 1],
  [0x0101, 0x012f, -1, 2],
  [0x0131, 0x0131, -232, 1],
  [0x0133, 0x0137, -1, 2],
  [0x013a, 0x0148, -1, 2],
  [0x014b, 0x0177, -1, 2],
  [0x017a, 0x017e, -1, 2],
  [0x017f, 0x017f, -300, 1],
  [0x0371, 0x0373, -1, 2],
  [0x0377, 0x0377, -1, 1],
  [0x037b, 0x037d, 130, 1],
  [0x03ac, 0x03ac, -38, 1],
  [0x03ad, 0x03af, -37, 1],
  [0x03b1, 0x03c1, -32, 1],
  [0x03c2, 0x03c2, -31, 1],
  [0x03c3, 0x03cb, -32, 1],
  [0x03cc, 0x03cc, -64, 1],
  [0x03cd, 0x03ce, -63, 1],
  [0x03d0, 0x03d0, -62, 1],
  [0x03d1, 0x03d1, -57, 1],
  [0x03d5, 0x03d5, -47, 1],
  [0x03d6, 0x03d6, -54, 1],
  [0x03d7, 0x03d7, -8, 1],
  [0x03d9, 0x03ef, -1, 2],
  [0x03f0, 0x03f0, -86, 1],
  [0x03f1, 0x03f1, -80, 1],
  [0x03f2, 0x03f2, 7, 1],
  [0x03f3, 0x03f3, -116, 1],
  [0x03f5, 0x03f5, -96, 1],
  [0x03f8, 0x03f8, -1, 1],
  [0x03fb, 0x03fb, -1, 1],
  [0x0430, 0x044f, -32, 1],
  [0x0450, 0x045f, -80, 1],
  [0x0461, 0x0481, -1, 2],
  [0x048b, 0x04bf, -1, 2],
  [0x04c2, 0x04ce, -1, 2],
  [0x04cf, 0x04cf, -15, 1],
  [0x04d1, 0x04ff, -1, 2],
];

const lowerRuns: readonly Run[] = [
  [0x0041, 0x005a, 32, 1],
  [0x00c0, 0x00d6, 32, 1],
  [0x00d8, 0x00de, 32, 1],
  [0x0100, 0x012e, 1, 2],
  [0x0130, 0x0130, -199, 1],
  [0x0132, 0x0136, 1, 2],
  [0x0139, 0x0147, 1, 2],
  [0x014a, 0x0176, 1, 2],
  [0x0178, 0x0178, -121, 1],
  [0x0179, 0x017d, 1, 2],
  [0x0370, 0x0372, 1, 2],
  [0x0376, 0x0376, 1, 1],
  [0x037f, 0x037f, 116, 1],
  [0x0386, 0x0386, 38, 1],
  [0x0388, 0x038a, 37, 1],
  [0x038c, 0x038c, 64, 1],
  [0x038e, 0x038f, 63, 1],
  [0x0391, 0x03a1, 32, 1],
  [0x03a3, 0x03ab, 32, 1],
  [0x03cf, 0x03cf, 8, 1],
  [0x03d8, 0x03ee, 1, 2],
  [0x03f4, 0x03f4, -60, 1],
  [0x03f7, 0x03f7, 1, 1],
  [0x03f9, 0x03f9, -7, 1],
  [0x03fa, 0x03fa, 1, 1],
  [0x03fd, 0x03ff, -130, 1],
  [0x0400, 0x040f, 80, 1],
  [0x0410, 0x042f, 32, 1],
  [0x0460, 0x0480, 1, 2],
  [0x048a, 0x04be, 1, 2],
  [0x04c0, 0x04c0, 15, 1],
  [0x04c1, 0x04cd, 1, 2],
  [0x04d0, 0x04fe, 1, 2],
];

function expand(runs: readonly Run[]): ReadonlyMap<number, number> {
  const table = new Map<number, number>();
  for (const [first, last, delta, step] of runs) {
    for (let unit = first; unit <= last; unit += step) table.set(unit, unit + delta);
  }
  return table;
}

const upperTable = expand(upperRuns);
const lowerTable = expand(lowerRuns);

export function toUpperSimple(text: string): string {
  return mapUnits(text, upperTable);
}

export function toLowerSimple(text: string): string {
  return mapUnits(text, lowerTable);
}

/** Every source and target is in the BMP, so a code unit maps to a code unit and length is kept. */
function mapUnits(text: string, table: ReadonlyMap<number, number>): string {
  let mapped = "";
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    const target = table.get(unit);
    mapped += target === undefined ? text.charAt(index) : String.fromCharCode(target);
  }
  return mapped;
}
