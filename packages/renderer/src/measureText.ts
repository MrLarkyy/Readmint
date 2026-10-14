import type { SfntFont } from "@readmint/fonts";

export interface TextMeasure {
  readonly font: SfntFont;
  readonly fontSize: number;
  readonly letterSpacing: number;
  /** Advances already computed for this font, size and spacing; the same numbers, looked up instead of recomputed. */
  readonly advances?: Map<number, number>;
}

/** Advance of one code point: glyph advance scaled to the size, plus letter spacing (no kerning in v0). */
export function codePointAdvance(codePoint: number, measure: TextMeasure): number {
  const cached = measure.advances?.get(codePoint);
  if (cached !== undefined) return cached;
  const { font, fontSize, letterSpacing } = measure;
  const advance =
    (font.advanceOf(font.glyphFor(codePoint)) * fontSize) / font.unitsPerEm + letterSpacing;
  measure.advances?.set(codePoint, advance);
  return advance;
}

/** Width of a line, summed per code point in order (so every engine adds the same numbers the same way). */
export function measureText(text: string, measure: TextMeasure): number {
  let width = 0;
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) index++;
    width += codePointAdvance(codePoint, measure);
  }
  return width;
}
