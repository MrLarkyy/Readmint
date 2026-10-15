import { ByteCursor } from "./ByteCursor.js";
import { ByteWriter } from "./ByteWriter.js";
import { MalformedFont } from "./MalformedFont.js";

/**
 * The hmtx table of a WOFF2 transformed hmtx (WOFF2 5.4): left side bearings the transform left out are the glyph
 * xMin values of the reconstructed glyf table.
 */
export function reconstructHmtx(
  data: Uint8Array,
  numHMetrics: number,
  xMins: Int16Array,
): Uint8Array {
  const cursor = new ByteCursor(data);
  const flags = cursor.u8();
  if ((flags & 0xfc) !== 0 || (flags & 0x03) === 0) {
    throw new MalformedFont("WOFF2 hmtx transform flags are invalid");
  }
  const numGlyphs = xMins.length;
  if (numHMetrics < 1 || numHMetrics > numGlyphs) {
    throw new MalformedFont("WOFF2 hmtx has more metrics than glyphs");
  }
  const advances = Array.from({ length: numHMetrics }, () => cursor.u16());
  const bearing = (glyph: number, present: boolean) =>
    present ? cursor.i16() : (xMins[glyph] ?? 0);
  const out = new ByteWriter(numHMetrics * 4 + (numGlyphs - numHMetrics) * 2);
  const proportional = (flags & 0x01) === 0;
  const lsbs = Array.from({ length: numHMetrics }, (_, glyph) => bearing(glyph, proportional));
  for (let glyph = 0; glyph < numHMetrics; glyph++) {
    out.u16(advances[glyph] ?? 0).i16(lsbs[glyph] ?? 0);
  }
  const monospaced = (flags & 0x02) === 0;
  for (let glyph = numHMetrics; glyph < numGlyphs; glyph++) out.i16(bearing(glyph, monospaced));
  return out.result();
}
