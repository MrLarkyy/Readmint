import { RangeTable } from "./RangeTable.js";
import { bidiClassRuns, bidiClassValues } from "./ucdTables.js";

/** A Bidi_Class value (UAX #9 table 4), short name. */
export type BidiClass = (typeof bidiClassValues)[number];

const table = new RangeTable(bidiClassRuns);

/** The Bidi_Class of a code point (Unicode 16.0.0, the defaults of unassigned code points included). */
export function bidiClassOf(codePoint: number): BidiClass {
  return bidiClassValues[table.get(codePoint)] ?? "L";
}
