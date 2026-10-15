import { fromCodePoints, normalizeText } from "./normalizeCharacters.js";
import { decompositionOf } from "./unicode/canonicalDecomposition.js";

/**
 * Unicode NFC of a text from this package's Unicode 16.0.0 tables (never the engine's `normalize`), per character
 * cluster: the form an accessible name of drawn text is written in, so canonically equivalent texts give equal bytes.
 * Like shaping, it leaves a run of more than 32 non-starters as written (not in canonical order), and a cluster holds at
 * most 32 code points, so such text is not exactly NFC.
 */
export function normalizeNfc(text: string): string {
  const singleton = (codePoint: number) => decompositionOf(codePoint)?.length === 1;
  return fromCodePoints(
    normalizeText(text, (codePoint) => !singleton(codePoint), "canonical").codePoints,
  );
}
