import { fromCodePoints, normalizeText } from "./normalizeCharacters.js";
import type { SfntFont } from "./SfntFont.js";

/**
 * The characters `shapeText` maps through the font's cmap for a text: per character cluster fully decomposed, marks
 * in order, recomposed only into characters the font maps (`normalizeCharacters`). Callers choosing a font for a
 * character or writing a glyph as its own character use it to follow the same rule as shaping.
 */
export function normalizeForFont(font: SfntFont, text: string): string {
  return fromCodePoints(
    normalizeText(text, (codePoint) => font.glyphFor(codePoint) !== 0).codePoints,
  );
}
