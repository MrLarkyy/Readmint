import type { SfntFont } from "./SfntFont.js";
import type { SpaceFallback } from "./unicode/spaceFallback.js";

const digits = "0123456789";

function firstMapped(font: SfntFont, characters: string): number {
  for (const char of characters) {
    const glyph = font.glyphFor(char.codePointAt(0) ?? 0);
    if (glyph !== 0) return glyph;
  }
  return 0;
}

/**
 * Advance in font units of a space variant the font lacks (HarfBuzz `_hb_ot_shape_fallback_spaces`), integers only;
 * `spaceAdvance` is the advance of the glyph drawn for it (the space glyph, or what GSUB made of it).
 */
export function fallbackSpaceAdvance(
  font: SfntFont,
  fallback: SpaceFallback,
  spaceAdvance: number,
): number {
  const upem = font.unitsPerEm;
  switch (fallback.kind) {
    case "em":
      return Math.trunc((upem + Math.trunc(fallback.divisor / 2)) / fallback.divisor);
    case "em4of18":
      return Math.trunc((upem * 4) / 18);
    case "figure": {
      const glyph = firstMapped(font, digits);
      return glyph === 0 ? spaceAdvance : font.advanceOf(glyph);
    }
    case "punctuation": {
      const glyph = firstMapped(font, ".,");
      return glyph === 0 ? spaceAdvance : font.advanceOf(glyph);
    }
    case "narrow":
      return Math.trunc(spaceAdvance / 2);
    case "space":
      return spaceAdvance;
  }
}
