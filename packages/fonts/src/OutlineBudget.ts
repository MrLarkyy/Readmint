import { FontRefused } from "./FontRefused.js";

/**
 * Outline work of one font in one render: some 200 glyphs at the per-glyph charstring cap, far more than any real
 * font needs for a README graphic, and well under a second.
 */
export const defaultOutlineOperations = 4_000_000;

/**
 * Work one font may cost while its outlines are read (charstring operations; points of TrueType glyphs), shared by
 * everything that reads them: drawing text as paths and flattening a CFF subset. A crafted font whose glyphs expand
 * through subroutines stops here with `too-large`, the same way on every run.
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
        `its outlines take more than ${String(this.limit)} operations in one render`,
      );
    }
  }
}
