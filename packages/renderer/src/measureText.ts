import type { SfntFont } from "@readmint/fonts";

export interface TextMeasure {
  readonly font: SfntFont;
  readonly fontSize: number;
  readonly letterSpacing: number;
}

/** Advance of one code point: glyph advance scaled to the size, plus letter spacing (no kerning in v0). */
export function codePointAdvance(codePoint: number, measure: TextMeasure): number {
  const { font, fontSize, letterSpacing } = measure;
  return (font.advanceOf(font.glyphFor(codePoint)) * fontSize) / font.unitsPerEm + letterSpacing;
}

/** Width of a line, summed per code point in order (so every engine adds the same numbers the same way). */
export function measureText(text: string, measure: TextMeasure): number {
  let width = 0;
  for (const char of text) width += codePointAdvance(char.codePointAt(0) ?? 0, measure);
  return width;
}
