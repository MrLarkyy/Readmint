import { RangeTable } from "./RangeTable.js";
import {
  indicPositionalRuns,
  indicPositionalValues,
  indicSyllabicRuns,
  indicSyllabicValues,
} from "./ucdTables.js";

/** An Indic_Syllabic_Category value; `Other` outside Devanagari and the Common characters used with it. */
export type IndicSyllabicCategory = (typeof indicSyllabicValues)[number];
/** An Indic_Positional_Category value; `NA` outside Devanagari and the Common characters used with it. */
export type IndicPositionalCategory = (typeof indicPositionalValues)[number];

const syllabic = new RangeTable(indicSyllabicRuns);
const positional = new RangeTable(indicPositionalRuns);

export function indicSyllabicOf(codePoint: number): IndicSyllabicCategory {
  return indicSyllabicValues[syllabic.get(codePoint)] ?? "Other";
}

export function indicPositionalOf(codePoint: number): IndicPositionalCategory {
  return indicPositionalValues[positional.get(codePoint)] ?? "NA";
}
