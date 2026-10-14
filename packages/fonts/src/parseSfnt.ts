import type { SfntFont, SfntProblemKind, SfntResult } from "./SfntFont.js";
import { MalformedFont } from "./MalformedFont.js";
import { SfntReader } from "./SfntReader.js";
import { readCmap } from "./readCmap.js";
import { readFamilyName } from "./readFamilyName.js";
import { readTableDirectory, requireTable } from "./readTableDirectory.js";
import { sniffFontFormat } from "./sniffFontFormat.js";

const useTypoMetrics = 0x0080;

/**
 * Reads the tables needed to measure text (head, hhea, maxp, hmtx, OS/2, name, cmap 4/12). Every offset and count
 * is checked against the bytes before use and the work is linear in the input, so a crafted file gives a problem,
 * never a throw or a long loop. WOFF, WOFF2 and collections are refused as unsupported.
 */
export function parseSfnt(bytes: Uint8Array): SfntResult {
  const format = sniffFontFormat(bytes);
  if (format === "woff" || format === "woff2") {
    return problem(
      "unsupported",
      "WOFF/WOFF2 arrive with font subsetting (RM-14); use a TTF or OTF file",
    );
  }
  if (format === "ttc") return problem("unsupported", "font collections (TTC) are not supported");
  if (format === undefined) return problem("malformed", "not a TrueType or OpenType font");
  try {
    return { ok: true, font: readFont(new SfntReader(bytes), format) };
  } catch (error) {
    if (error instanceof MalformedFont) return problem("malformed", error.message);
    throw error;
  }
}

function problem(kind: SfntProblemKind, message: string): SfntResult {
  return { ok: false, kind, message };
}

function readFont(reader: SfntReader, format: "ttf" | "otf"): SfntFont {
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
  const typo = (reader.u16(os2.offset + 62) & useTypoMetrics) !== 0;
  const vertical = typo ? os2.offset + 68 : hhea.offset + 4;
  const lookup = readCmap(reader, requireTable(tables, "cmap", 4));
  return Object.freeze({
    format,
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
  });
}
