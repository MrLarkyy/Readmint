import type { FontUse } from "./FontUse.js";

/** The BMP Private Use Area, U+E000..U+F8FF. */
const bmpCodes = 0x1900;
/** Supplementary Private Use Area-A, U+F0000..U+FFFFD (U+FFFFE and U+FFFFF are noncharacters). */
const planeFifteenCodes = 0xfffe;

/**
 * The private-use code point a shaped glyph of a font is written as in font mode, the same for every use of the glyph
 * in a render: the BMP area first (one UTF-16 unit, shareable tspans), then planes 15 and 16, in the order glyphs are
 * first placed, so the same design always numbers them the same.
 */
export function privateCode(use: FontUse, glyph: number): number {
  let code = use.privateCodes.get(glyph);
  if (code === undefined) {
    const index = use.privateCodes.size;
    code =
      index < bmpCodes
        ? 0xe000 + index
        : index < bmpCodes + planeFifteenCodes
          ? 0xf0000 + index - bmpCodes
          : 0x100000 + index - bmpCodes - planeFifteenCodes;
    use.privateCodes.set(glyph, code);
  }
  return code;
}
