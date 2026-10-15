import { isFormat, isNonSpacingMark } from "./characterFlags.js";
import { RangeTable } from "./RangeTable.js";
import { joiningRuns, joiningValues } from "./ucdTables.js";

/** Joining_Type: U non-joining, L left, R right, D dual, C join-causing, T transparent. */
export type JoiningType = Exclude<(typeof joiningValues)[number], "X">;

const table = new RangeTable(joiningRuns);

/** The Joining_Type of a code point (ArabicShaping.txt; an unlisted Mn, Me or Cf is T). */
export function joiningTypeOf(codePoint: number): JoiningType {
  const listed = joiningValues[table.get(codePoint)] ?? "X";
  if (listed !== "X") return listed;
  return isNonSpacingMark(codePoint) || isFormat(codePoint) ? "T" : "U";
}
