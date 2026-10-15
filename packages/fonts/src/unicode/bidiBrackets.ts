import { decodePairs } from "./decodeVarints.js";
import { bracketPairs } from "./ucdTables.js";

/** A paired bracket (BidiBrackets.txt): its pair and whether it opens. */
export interface BidiBracket {
  readonly pair: number;
  readonly opening: boolean;
}

let brackets: Map<number, BidiBracket> | undefined;

/** The Bidi_Paired_Bracket of a code point, undefined when it is no paired bracket. */
export function bracketOf(codePoint: number): BidiBracket | undefined {
  if (brackets === undefined) {
    brackets = new Map();
    for (const [opening, closing] of decodePairs(bracketPairs)) {
      brackets.set(opening, { pair: closing, opening: true });
      brackets.set(closing, { pair: opening, opening: false });
    }
  }
  return brackets.get(codePoint);
}
