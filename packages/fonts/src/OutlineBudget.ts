import { FontRefused } from "./FontRefused.js";

/**
 * Outline work of one render, all its fonts together: some 200 glyphs at the per-glyph charstring cap, far more than
 * any real README graphic needs, and well under a second.
 */
export const defaultOutlineOperations = 4_000_000;

/**
 * Work the outlines of a render may cost (charstring operations; points of TrueType glyphs), shared by every font
 * and by everything that reads outlines: text drawn as paths and flattened CFF subsets. A crafted font whose glyphs
 * expand through subroutines, or many fonts together, stop here with `too-large`: the reader that crosses the limit
 * fails, in the same order on every run.
 */
export class OutlineBudget {
  private remaining: number;

  constructor(readonly limit: number = defaultOutlineOperations) {
    this.remaining = limit;
  }

  spend(operations: number): void {
    this.remaining -= operations;
    if (this.remaining < 0) {
      throw new FontRefused(
        "too-large",
        `reading its outlines brings the render past ${String(this.limit)} outline operations (all fonts together)`,
      );
    }
  }
}
