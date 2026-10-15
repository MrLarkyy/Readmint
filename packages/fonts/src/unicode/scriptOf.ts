import { RangeTable } from "./RangeTable.js";
import { scriptRuns, scriptValues } from "./ucdTables.js";

/**
 * ISO 15924 code of a script with a shaper or an OpenType script tag of its own; `Zyyy` Common, `Zinh` Inherited,
 * `Zzzz` unassigned, `Other` every other script.
 */
export type ScriptCode = (typeof scriptValues)[number];

const table = new RangeTable(scriptRuns);

/** The Script property of a code point (Unicode 16.0.0). */
export function scriptOf(codePoint: number): ScriptCode {
  return scriptValues[table.get(codePoint)] ?? "Zzzz";
}
