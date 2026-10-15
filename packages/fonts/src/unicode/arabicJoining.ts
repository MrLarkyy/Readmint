import { RangeTable } from "./RangeTable.js";
import { joiningRuns, joiningValues } from "./ucdTables.js";

/** Joining_Type: U non-joining, L left, R right, D dual, C join-causing, T transparent. */
export type JoiningType = (typeof joiningValues)[number];

const table = new RangeTable(joiningRuns);

/** The Joining_Type of a code point (ArabicShaping.txt; an unlisted Mn, Me or Cf is T). */
export function joiningTypeOf(codePoint: number): JoiningType {
  return joiningValues[table.get(codePoint)] ?? "U";
}
