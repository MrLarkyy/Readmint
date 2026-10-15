import { decodePairs } from "./decodeVarints.js";
import { mirrorPairs } from "./ucdTables.js";

let mirrors: Map<number, number> | undefined;

/** The Bidi_Mirroring_Glyph of a code point, undefined when it has none. */
export function mirrorOf(codePoint: number): number | undefined {
  mirrors ??= decodePairs(mirrorPairs);
  return mirrors.get(codePoint);
}
