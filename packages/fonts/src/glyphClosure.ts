import { GlyfTable } from "./GlyfTable.js";
import { MalformedFont } from "./MalformedFont.js";
import type { SfntFont } from "./SfntFont.js";

/**
 * The glyphs a subset needs to draw `glyphs`: .notdef, the glyphs themselves and, for TrueType, every component of
 * a composite glyph, ascending. CFF outlines are flattened when subset, so they need no components.
 */
export function glyphClosure(font: SfntFont, glyphs: Iterable<number>): number[] {
  const found = new Set<number>([0]);
  for (const glyph of glyphs) {
    if (!Number.isInteger(glyph) || glyph < 0 || glyph >= font.numGlyphs) {
      throw new MalformedFont(`glyph ${String(glyph)} is outside the font`);
    }
    found.add(glyph);
  }
  if (font.outlines === "glyf") {
    const glyf = glyfTableOf(font);
    const pending = [...found];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const component of glyf.components(next)) {
        if (found.has(component)) continue;
        found.add(component);
        pending.push(component);
      }
    }
  }
  return [...found].sort((left, right) => left - right);
}

export function glyfTableOf(font: SfntFont): GlyfTable {
  const glyf = font.table("glyf");
  const loca = font.table("loca");
  const head = font.table("head");
  if (glyf === undefined || loca === undefined || head === undefined || head.length < 52) {
    throw new MalformedFont("font has no glyf, loca or head table");
  }
  const indexToLocFormat = (head[50] ?? 0) * 256 + (head[51] ?? 0);
  return new GlyfTable(glyf, loca, indexToLocFormat === 1, font.numGlyphs);
}
