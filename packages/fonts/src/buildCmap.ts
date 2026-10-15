import { ByteWriter } from "./ByteWriter.js";
import { binarySearchHeader } from "./writeSfnt.js";

interface Segment {
  readonly start: number;
  end: number;
  readonly glyph: number;
}

/** Keeps a format 4 subtable well inside its 64 KiB length field. */
const maxSegments = 8000;

/**
 * A cmap table mapping exactly the given code points (ascending, each once) to their glyphs: format 4 (Windows BMP)
 * and, when a code point lies above the BMP or the BMP needs too many segments, format 12 (Windows full Unicode).
 */
export function buildCmap(
  entries: readonly (readonly [codePoint: number, glyph: number])[],
): Uint8Array {
  const all = segments(entries);
  const bmp = all.filter((segment) => segment.end < 0xffff);
  const full = bmp.length !== all.length || bmp.length > maxSegments;
  const format4 = writeFormat4(full && bmp.length > maxSegments ? [] : bmp);
  const format12 = full ? writeFormat12(all) : undefined;
  const out = new ByteWriter();
  const count = format12 === undefined ? 1 : 2;
  out.u16(0).u16(count);
  out
    .u16(3)
    .u16(1)
    .u32(4 + count * 8);
  if (format12 !== undefined)
    out
      .u16(3)
      .u16(10)
      .u32(4 + count * 8 + format4.length);
  out.bytes(format4);
  if (format12 !== undefined) out.bytes(format12);
  return out.result();
}

/** Runs of consecutive code points mapped to consecutive glyphs; a run never crosses into the astral planes. */
function segments(entries: readonly (readonly [number, number])[]): Segment[] {
  const result: Segment[] = [];
  for (const [codePoint, glyph] of entries) {
    const last = result.at(-1);
    if (
      last !== undefined &&
      codePoint === last.end + 1 &&
      glyph === last.glyph + codePoint - last.start &&
      (codePoint < 0xffff || last.start > 0xffff)
    ) {
      last.end = codePoint;
    } else {
      result.push({ start: codePoint, end: codePoint, glyph });
    }
  }
  return result;
}

function writeFormat4(segments: readonly Segment[]): Uint8Array {
  const all = [...segments, { start: 0xffff, end: 0xffff, glyph: 0 }];
  const count = all.length;
  const { power, exponent } = binarySearchHeader(count);
  const out = new ByteWriter(16 + count * 8);
  out
    .u16(4)
    .u16(16 + count * 8)
    .u16(0);
  out
    .u16(count * 2)
    .u16(power * 2)
    .u16(exponent)
    .u16(count * 2 - power * 2);
  for (const segment of all) out.u16(segment.end);
  out.u16(0);
  for (const segment of all) out.u16(segment.start);
  for (const segment of all) out.u16(segment.glyph - segment.start);
  for (let index = 0; index < count; index++) out.u16(0);
  return out.result();
}

function writeFormat12(segments: readonly Segment[]): Uint8Array {
  const out = new ByteWriter(16 + segments.length * 12);
  out
    .u16(12)
    .u16(0)
    .u32(16 + segments.length * 12)
    .u32(0)
    .u32(segments.length);
  for (const segment of segments) out.u32(segment.start).u32(segment.end).u32(segment.glyph);
  return out.result();
}
