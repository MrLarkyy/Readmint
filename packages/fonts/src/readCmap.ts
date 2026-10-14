import { MalformedFont } from "./MalformedFont.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

export type GlyphLookup = (codePoint: number) => number;

/** Subtables in order of preference: full Unicode (format 12) before the BMP-only format 4. */
const preference: readonly (readonly [platform: number, encoding: number, format: number])[] = [
  [3, 10, 12],
  [0, 6, 12],
  [0, 4, 12],
  [3, 1, 4],
  [0, 3, 4],
  [0, 2, 4],
  [0, 1, 4],
  [0, 0, 4],
];

/** The preferred Unicode subtable as a binary-search lookup; every read stays inside the cmap table. */
export function readCmap(reader: SfntReader, cmap: SfntTable): GlyphLookup {
  const end = cmap.offset + cmap.length;
  const count = reader.u16(cmap.offset + 2);
  if (4 + count * 8 > cmap.length) throw new MalformedFont("font cmap directory is truncated");
  const found = new Map<string, number>();
  for (let index = 0; index < count; index++) {
    const record = cmap.offset + 4 + index * 8;
    const offset = cmap.offset + reader.u32(record + 4);
    if (offset + 2 > end) throw new MalformedFont("font cmap subtable lies past the end");
    const key = `${String(reader.u16(record))}/${String(reader.u16(record + 2))}/${String(reader.u16(offset))}`;
    if (!found.has(key)) found.set(key, offset);
  }
  for (const [platform, encoding, format] of preference) {
    const offset = found.get(`${String(platform)}/${String(encoding)}/${String(format)}`);
    if (offset === undefined) continue;
    return format === 12 ? readFormat12(reader, offset, end) : readFormat4(reader, offset, end);
  }
  throw new MalformedFont("font has no Unicode cmap (format 4 or 12)");
}

function readFormat4(reader: SfntReader, offset: number, end: number): GlyphLookup {
  const segments = reader.u16(offset + 6) / 2;
  if (!Number.isInteger(segments) || segments === 0) {
    throw new MalformedFont("font cmap format 4 is malformed");
  }
  const endCodes = offset + 14;
  const startCodes = endCodes + segments * 2 + 2;
  const deltas = startCodes + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  if (rangeOffsets + segments * 2 > end) throw new MalformedFont("font cmap format 4 is truncated");
  return (codePoint) => {
    if (codePoint > 0xffff) return 0;
    let low = 0;
    let high = segments - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (reader.u16(endCodes + middle * 2) < codePoint) low = middle + 1;
      else high = middle;
    }
    const start = reader.u16(startCodes + low * 2);
    if (reader.u16(endCodes + low * 2) < codePoint || start > codePoint) return 0;
    const delta = reader.u16(deltas + low * 2);
    const rangeOffset = reader.u16(rangeOffsets + low * 2);
    if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
    const address = rangeOffsets + low * 2 + rangeOffset + (codePoint - start) * 2;
    if (address + 2 > end) return 0;
    const glyph = reader.u16(address);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  };
}

function readFormat12(reader: SfntReader, offset: number, end: number): GlyphLookup {
  const groups = reader.u32(offset + 12);
  if (offset + 16 + groups * 12 > end) throw new MalformedFont("font cmap format 12 is truncated");
  if (groups === 0) return () => 0;
  return (codePoint) => {
    let low = 0;
    let high = groups - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (reader.u32(offset + 16 + middle * 12 + 4) < codePoint) low = middle + 1;
      else high = middle;
    }
    const group = offset + 16 + low * 12;
    const start = reader.u32(group);
    if (start > codePoint || reader.u32(group + 4) < codePoint) return 0;
    return reader.u32(group + 8) + (codePoint - start);
  };
}
