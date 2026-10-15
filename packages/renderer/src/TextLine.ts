import type { LoadedFont } from "./loadFont.js";

/** A glyph placed by the renderer: `x` is the pen position from the left of the text box (alignment included). */
export interface PlacedGlyph {
  readonly glyph: number;
  /**
   * The character written for the glyph in font mode and mapped to it in the subset: its own character when that
   * draws exactly this glyph, else a private-use character of the subset (`privateCode`).
   */
  readonly codePoint: number;
  readonly x: number;
  /** Offset upwards from the baseline (a mark on its base); 0 for most glyphs. */
  readonly y: number;
}

/** Consecutive glyphs of one line drawn with the same font. */
export interface TextRun {
  readonly font: LoadedFont;
  readonly glyphs: readonly PlacedGlyph[];
}

/**
 * One laid-out line in visual order: every position decided here (shaping, fallback, kerning, marks, bidi order,
 * letter spacing, alignment), so no drawer shapes, reorders or aligns anything. A character no font covers keeps
 * its advance but is in no run.
 */
export interface TextLine {
  readonly width: number;
  readonly runs: readonly TextRun[];
}
