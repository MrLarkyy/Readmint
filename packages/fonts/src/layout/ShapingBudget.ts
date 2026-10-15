import { MalformedFont } from "../MalformedFont.js";

/** Lookups a context lookup may call through each other (HarfBuzz allows 64; real fonts nest two or three deep). */
export const maxNesting = 8;
/** Glyphs one backtrack, input or lookahead sequence of a context rule, or one ligature, may name. */
export const maxSequence = 64;

/**
 * The work one shaping call may do on a font's layout tables, counted in operations (a subtable tried on a glyph,
 * a glyph stepped over, a ligature or rule entry compared, a glyph moved in the buffer) rather than time, so a
 * hostile font fails the same way on every machine. The bounds follow HarfBuzz's max_ops and max_len: a multiple of
 * the input, with a floor for short texts.
 */
export class ShapingBudget {
  readonly maxOperations: number;
  readonly maxLength: number;
  private operations = 0;

  constructor(inputGlyphs: number) {
    this.maxOperations = Math.max(16_384, 64 * inputGlyphs);
    this.maxLength = Math.max(4096, 8 * inputGlyphs);
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

  /** A buffer grown to `length` glyphs. */
  checkLength(length: number): void {
    if (length > this.maxLength) {
      throw new MalformedFont(
        `font layout tables grow the text past ${String(this.maxLength)} glyphs`,
      );
    }
  }
}
