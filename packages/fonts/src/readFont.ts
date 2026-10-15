import { CffTable } from "./CffTable.js";
import type { FontFormat } from "./FontFormat.js";
import { FontRefused } from "./FontRefused.js";
import { GlyfTable } from "./GlyfTable.js";
import type { GlyphOutline } from "./GlyphOutline.js";
import type { OutlineBudget } from "./OutlineBudget.js";
import { MalformedFont } from "./MalformedFont.js";
import { readCmap } from "./readCmap.js";
import { readFamilyName } from "./readFamilyName.js";
import { readKerning, type KerningLookup } from "./readKerning.js";
import { readTableDirectory, requireTable, type SfntTable } from "./readTableDirectory.js";
import type { SfntFont } from "./SfntFont.js";
import type { SfntReader } from "./SfntReader.js";

const useTypoMetrics = 0x0080;

/** The font of an sfnt: measuring tables and the CFF structure read now, glyph outlines and kerning on first use. */
export function readFont(
  reader: SfntReader,
  format: "ttf" | "otf",
  container: FontFormat,
): SfntFont {
  const tables = readTableDirectory(reader);
  const head = requireTable(tables, "head", 54);
  const hhea = requireTable(tables, "hhea", 36);
  const maxp = requireTable(tables, "maxp", 6);
  const os2 = requireTable(tables, "OS/2", 78);
  const hmtx = requireTable(tables, "hmtx", 4);
  const unitsPerEm = reader.u16(head.offset + 18);
  if (unitsPerEm < 16 || unitsPerEm > 16_384) {
    throw new MalformedFont(`font unitsPerEm ${String(unitsPerEm)} is outside 16..16384`);
  }
  const numGlyphs = reader.u16(maxp.offset + 4);
  const hMetrics = reader.u16(hhea.offset + 34);
  if (hMetrics === 0 || hMetrics * 4 > hmtx.length) {
    throw new MalformedFont("font hmtx table is shorter than hhea declares");
  }
  const outlines = outlineKind(tables);
  const outline = outlineReader(reader, tables, outlines, numGlyphs, {
    indexToLocFormat: reader.i16(head.offset + 50),
    unitsPerEm,
  });
  const typo = (reader.u16(os2.offset + 62) & useTypoMetrics) !== 0;
  const vertical = typo ? os2.offset + 68 : hhea.offset + 4;
  const lookup = readCmap(reader, requireTable(tables, "cmap", 4));
  let kerning: KerningLookup | undefined;
  return Object.freeze({
    format,
    container,
    outlines,
    unitsPerEm,
    ascender: reader.i16(vertical),
    descender: Math.min(reader.i16(vertical + 2), 0),
    lineGap: reader.i16(vertical + 4),
    fsType: reader.u16(os2.offset + 8),
    weightClass: reader.u16(os2.offset + 4),
    familyName: readFamilyName(reader, tables.get("name")),
    numGlyphs,
    glyphFor(codePoint: number): number {
      const glyph = lookup(codePoint);
      return glyph < numGlyphs ? glyph : 0;
    },
    advanceOf(glyph: number): number {
      const index = Math.min(Math.max(0, Math.trunc(glyph)), hMetrics - 1);
      return reader.u16(hmtx.offset + index * 4);
    },
    bearingOf(glyph: number): number {
      const index = Math.max(0, Math.trunc(glyph));
      if (index < hMetrics) return reader.i16(hmtx.offset + index * 4 + 2);
      const offset = hMetrics * 4 + (index - hMetrics) * 2;
      return offset + 2 <= hmtx.length ? reader.i16(hmtx.offset + offset) : 0;
    },
    kerning(left: number, right: number): number {
      kerning ??= readKerning(reader, tables);
      return kerning(left, right);
    },
    outline,
    table(tag: string): Uint8Array | undefined {
      const table = tables.get(tag);
      return table === undefined ? undefined : reader.slice(table.offset, table.length);
    },
  });
}

function outlineKind(tables: ReadonlyMap<string, SfntTable>): "glyf" | "cff" {
  if (tables.has("CFF ")) return "cff";
  if (tables.has("glyf")) return "glyf";
  if (tables.has("CFF2")) throw new FontRefused("unsupported", "CFF2 outlines are not supported");
  throw new MalformedFont("font has neither glyf nor CFF outlines");
}

/**
 * Outline reader of the font. A CFF table's structure (INDEXes, DICTs, FontMatrix) is read now, so an unsupported
 * or broken one is a problem of the parse; glyphs are read on request.
 */
function outlineReader(
  reader: SfntReader,
  tables: ReadonlyMap<string, SfntTable>,
  kind: "glyf" | "cff",
  numGlyphs: number,
  head: { readonly indexToLocFormat: number; readonly unitsPerEm: number },
): (glyph: number, budget?: OutlineBudget) => GlyphOutline {
  const bytes = (tag: string) => {
    const table = requireTable(tables, tag, 0);
    return reader.slice(table.offset, table.length);
  };
  if (kind === "glyf") {
    if (head.indexToLocFormat !== 0 && head.indexToLocFormat !== 1) {
      throw new MalformedFont("font head indexToLocFormat is neither 0 nor 1");
    }
    const glyf = new GlyfTable(
      bytes("glyf"),
      bytes("loca"),
      head.indexToLocFormat === 1,
      numGlyphs,
    );
    return (glyph, budget) => glyf.outline(glyph, budget);
  }
  const cff = new CffTable(bytes("CFF "), head.unitsPerEm);
  return (glyph, budget) => {
    if (glyph >= numGlyphs) throw new MalformedFont(`glyph ${String(glyph)} is outside the font`);
    return cff.outline(glyph, budget);
  };
}
