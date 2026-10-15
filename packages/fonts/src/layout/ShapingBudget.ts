import { MalformedFont } from "../MalformedFont.js";

/** Lookups a context lookup may call through each other (HarfBuzz allows 64; real fonts nest two or three deep). */
export const maxNesting = 8;
/** Glyphs one backtrack, input or lookahead sequence of a context rule, or one ligature, may name. */
export const maxSequence = 64;

/**
 * The work shaping may do on a font's layout tables, counted in operations (a subtable tried on a glyph, a glyph
 * stepped over, a ligature, rule or lookup entry compared, a glyph moved in the buffer) rather than time, so a
 * hostile font fails the same way on every machine. One budget may be shared by many `shapeText` calls (every word
 * and line of one text), so their work together is bounded, not each call's. The bound follows HarfBuzz's max_ops:
 * a multiple of the text, with a floor for short texts.
 */
export class ShapingBudget {
  private operations = 0;

  constructor(readonly maxOperations: number) {}

  /** The budget for shaping a text of `characters` UTF-16 units: max(16384, 64 x characters). */
  static forText(characters: number): ShapingBudget {
    return new ShapingBudget(Math.max(16_384, 64 * characters));
  }

  /** Operations spent so far. */
  get used(): number {
    return this.operations;
  }

  charge(count = 1): void {
    this.operations += count;
    if (this.operations > this.maxOperations) {
      throw new MalformedFont(
        `font layout tables take more than ${String(this.maxOperations)} operations to shape the text`,
      );
    }
  }
}

/** The glyphs one shaping call may grow its buffer to (HarfBuzz max_len): max(4096, 8 x its characters). */
export function maxBufferLength(characters: number): number {
  return Math.max(4096, 8 * characters);
}
