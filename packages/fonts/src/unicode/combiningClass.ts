import { RangeTable } from "./RangeTable.js";
import { combiningClassRuns } from "./ucdTables.js";

const table = new RangeTable(combiningClassRuns);

/**
 * Classes fonts expect in another order than Unicode's (HarfBuzz's modified combining classes): Hebrew points in the
 * SBL Hebrew order, Arabic shadda (33) before the vowel marks, the Telugu length marks (84, 91) and Thai sara u (103)
 * before the virama, Tibetan sign u (132) before sign i (130). Each class keeps a key of its own (no two classes
 * share one), so canonically equivalent texts still sort alike.
 */
const modified = new Map<number, number>([
  [10, 22],
  [11, 15],
  [12, 16],
  [13, 17],
  [14, 23],
  [15, 18],
  [16, 19],
  [17, 20],
  [18, 21],
  [19, 14],
  [20, 24],
  [21, 12],
  [22, 25],
  [23, 13],
  [24, 10],
  [25, 11],
  [27, 28],
  [28, 29],
  [29, 30],
  [30, 31],
  [31, 32],
  [32, 33],
  [33, 27],
  [84, 4],
  [91, 5],
  [103, 3],
  [130, 132],
  [132, 131],
]);

/** Canonical_Combining_Class of a code point (Unicode 16.0.0): 0 for a starter. */
export function combiningClassOf(codePoint: number): number {
  return table.get(codePoint);
}

/**
 * The key marks are put in order by before shaping: the combining class, remapped as HarfBuzz does for fonts. Tai
 * Tham sakot (U+1A60) and Tibetan padma (U+0FC6) go after every other mark and Tibetan tsa-phru (U+0F39) before
 * sign u, which their fonts' mark positioning assumes.
 */
export function modifiedCombiningClassOf(codePoint: number): number {
  if (codePoint === 0x1a60 || codePoint === 0x0fc6) return 254;
  if (codePoint === 0x0f39) return 127;
  const combining = table.get(codePoint);
  return modified.get(combining) ?? combining;
}
