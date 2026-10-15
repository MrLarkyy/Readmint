import type { LoadedFont } from "./loadFont.js";

/** A glyph placed by the renderer: `x` is the pen position from the left of the text box (alignment included). */
export interface PlacedGlyph {
  readonly glyph: number;
  readonly codePoint: number;
  readonly x: number;
}

/** Consecutive glyphs of one line drawn with the same font. */
export interface TextRun {
  readonly font: LoadedFont;
  readonly glyphs: readonly PlacedGlyph[];
}

/**
 * One laid-out line: every position decided here (fallback, kerning, letter spacing, alignment), so no drawer
 * shapes or aligns anything. A code point no font covers keeps its advance but is in no run.
 */
export interface TextLine {
  readonly width: number;
  readonly runs: readonly TextRun[];
}
