/**
 * The glyphs of a shaped run in visual order (left to right, also for a right-to-left run), positions in integer
 * font units: a glyph is drawn at the pen position plus its offsets (y up), then the pen moves by its advance.
 */
export interface ShapedRun {
  readonly glyphs: readonly number[];
  /** UTF-16 offset in the run text of the first character of each glyph's cluster. */
  readonly clusters: readonly number[];
  readonly advances: readonly number[];
  readonly xOffsets: readonly number[];
  readonly yOffsets: readonly number[];
  /** Whether each glyph is a mark (GDEF class 3, or a non-spacing mark in a font without GDEF classes). */
  readonly marks: readonly boolean[];
  readonly rtl: boolean;
}
