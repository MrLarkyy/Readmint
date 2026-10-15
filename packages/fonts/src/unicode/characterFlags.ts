import { RangeTable } from "./RangeTable.js";
import { flagRuns } from "./ucdTables.js";

const table = new RangeTable(flagRuns);

/** General category Mn or Me: a mark drawn on the character before it. */
export function isNonSpacingMark(codePoint: number): boolean {
  return (table.get(codePoint) & 1) !== 0;
}

/** General category Mc. */
export function isSpacingMark(codePoint: number): boolean {
  return (table.get(codePoint) & 2) !== 0;
}

/** Default_Ignorable_Code_Point: joiners, bidi controls, variation selectors and the like, never drawn. */
export function isDefaultIgnorable(codePoint: number): boolean {
  return (table.get(codePoint) & 4) !== 0;
}

/** General category L* (any letter). */
export function isLetter(codePoint: number): boolean {
  return (table.get(codePoint) & 8) !== 0;
}

/** General category Cf. */
export function isFormat(codePoint: number): boolean {
  return (table.get(codePoint) & 16) !== 0;
}
