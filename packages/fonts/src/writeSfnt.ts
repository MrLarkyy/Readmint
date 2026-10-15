import { ByteWriter } from "./ByteWriter.js";
import { tableChecksum } from "./tableChecksum.js";

/** Largest power of two not above `count`, and its exponent (the binary search fields of sfnt and cmap headers). */
export function binarySearchHeader(count: number): { power: number; exponent: number } {
  let power = 1;
  let exponent = 0;
  while (power * 2 <= count) {
    power *= 2;
    exponent++;
  }
  return { power, exponent };
}

export function align4(length: number): number {
  return (length + 3) & ~3;
}

/**
 * An sfnt from its tables: directory sorted by tag, tables 4-byte aligned, checksums computed. With
 * `adjustChecksum` the head checkSumAdjustment is recomputed (a font built here); without it the head bytes stay as
 * given (a font decoded from WOFF or WOFF2).
 */
export function writeSfnt(
  flavor: number,
  tables: ReadonlyMap<string, Uint8Array>,
  adjustChecksum: boolean,
): Uint8Array {
  const tags = [...tables.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const { power, exponent } = binarySearchHeader(tags.length);
  let total = 12 + tags.length * 16;
  for (const data of tables.values()) total += align4(data.length);
  const out = new ByteWriter(total);
  out
    .u32(flavor)
    .u16(tags.length)
    .u16(power * 16)
    .u16(exponent)
    .u16(tags.length * 16 - power * 16);
  let offset = 12 + tags.length * 16;
  const placed: { tag: string; data: Uint8Array; offset: number }[] = [];
  for (const tag of tags) {
    const data = prepared(tag, tables.get(tag) ?? new Uint8Array(0), adjustChecksum);
    out.tag(tag).u32(tableChecksum(data)).u32(offset).u32(data.length);
    placed.push({ tag, data, offset });
    offset += align4(data.length);
  }
  for (const { data } of placed) out.bytes(data).align4();
  const head = placed.find((table) => table.tag === "head");
  if (adjustChecksum && head !== undefined && head.data.length >= 12) {
    const font = out.result();
    out.setU32(head.offset + 8, 0xb1b0afba - tableChecksum(font));
  }
  return out.result();
}

/** The head table with checkSumAdjustment zeroed, as its checksum is defined. */
function prepared(tag: string, data: Uint8Array, adjustChecksum: boolean): Uint8Array {
  if (!adjustChecksum || tag !== "head" || data.length < 12) return data;
  const copy = new Uint8Array(data);
  new DataView(copy.buffer).setUint32(8, 0);
  return copy;
}
