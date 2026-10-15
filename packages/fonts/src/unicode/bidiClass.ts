import { RangeTable } from "./RangeTable.js";
import { bidiClassRuns, bidiClassValues } from "./ucdTables.js";

/** A Bidi_Class value (UAX #9 table 4), short name. */
export type BidiClass = (typeof bidiClassValues)[number];

const table = new RangeTable(bidiClassRuns);

/** The Bidi_Class of a code point (Unicode 16.0.0, the defaults of unassigned code points included). */
export function bidiClassOf(codePoint: number): BidiClass {
  return bidiClassValues[table.get(codePoint)] ?? "L";
}

/** Bidi_Class L, R or AL: a strong character, which letters of every script are. */
export function isStrong(codePoint: number): boolean {
  return table.get(codePoint) <= 2;
}

/** The Bidi_Class as its index in `bidiClassValues` (the bidi algorithm works on these). */
export function bidiClassIndex(codePoint: number): number {
  return table.get(codePoint);
}
