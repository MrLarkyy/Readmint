import type { SfntFont } from "./SfntFont.js";
import { spaceFallbackOf } from "./unicode/spaceFallback.js";

const space = 0x20;
const hyphenMinus = 0x2d;
const hyphen = 0x2010;
const nonBreakingHyphen = 0x2011;

/**
 * The glyph that draws a character: the font's own, else (as HarfBuzz) the space glyph for a space variant, and the
 * U+2010 (else U+002D) glyph for U+2011. 0 when the font has none. Shaping and font choice share this rule.
 */
export function glyphForCharacter(font: SfntFont, codePoint: number): number {
  const own = font.glyphFor(codePoint);
  if (own !== 0) return own;
  if (spaceFallbackOf(codePoint) !== undefined) return font.glyphFor(space);
  if (codePoint === nonBreakingHyphen) {
    const dash = font.glyphFor(hyphen);
    return dash !== 0 ? dash : font.glyphFor(hyphenMinus);
  }
  return 0;
}
