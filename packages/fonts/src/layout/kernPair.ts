import type { SfntFont } from "../SfntFont.js";
import { ApplyContext } from "./ApplyContext.js";
import { FontLayout } from "./FontLayout.js";
import { GlyphBuffer, glyphInfo } from "./GlyphBuffer.js";
import { applyGposSubtable } from "./GposLookups.js";
import { maxBufferLength, ShapingBudget } from "./ShapingBudget.js";

/**
 * Pair kerning between two glyphs in font units (`SfntFont.kerning`): the GPOS lookups of feature kern under DFLT,
 * dflt or latn applied to the pair by the same engine `shapeText` uses, else the legacy kern table; only the first
 * glyph's advance counts.
 */
export function kernPair(font: SfntFont, left: number, right: number): number {
  const layout = FontLayout.of(font);
  const gpos = layout.gpos;
  const lookups = gpos?.selectFeatures([], ["kern"]).get("kern") ?? [];
  if (gpos === undefined || lookups.length === 0) return layout.legacyKerning?.(left, right) ?? 0;
  const glyphs = [glyphInfo(left, 0, 0), glyphInfo(right, 0, 1)];
  for (const info of glyphs) {
    info.mask = 1;
    info.glyphClass = layout.gdef.glyphClass(info.glyph);
  }
  const buffer = new GlyphBuffer(glyphs, ShapingBudget.forText(2), maxBufferLength(2));
  const context = new ApplyContext(gpos, layout.gdef, buffer, false, applyGposSubtable);
  for (const index of lookups) {
    const lookup = gpos.lookup(index);
    if (lookup === undefined) continue;
    context.applyLookup(lookup, { mask: 1, autoZwj: true, autoZwnj: true, perSyllable: false });
  }
  return glyphs[0]?.xAdvance ?? 0;
}
