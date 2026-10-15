import { zlibSync } from "fflate";
import { ByteWriter } from "./ByteWriter.js";
import { MalformedFont } from "./MalformedFont.js";
import { SfntReader } from "./SfntReader.js";
import { align4 } from "./writeSfnt.js";

interface Entry {
  readonly tag: string;
  readonly checksum: number;
  readonly data: Uint8Array;
  readonly stored: Uint8Array;
}

/**
 * WOFF 1.0 of an sfnt: each table zlib-compressed at level 9 when that makes it smaller, no metadata, no private
 * data. fflate's window size is fixed (`mem`), not derived from `Math.log` of the input, so every engine produces the
 * same bytes.
 */
export function encodeWoff(sfnt: Uint8Array): Uint8Array {
  const reader = new SfntReader(sfnt);
  const count = reader.u16(4);
  const entries: Entry[] = [];
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const data = reader.slice(reader.u32(record + 8), reader.u32(record + 12));
    const compressed = zlibSync(data, { level: 9, mem: 8 });
    entries.push({
      tag: reader.tag(record),
      checksum: reader.u32(record + 4),
      data,
      stored: compressed.length < data.length ? compressed : data,
    });
  }
  if (entries.some((entry, index) => index > 0 && (entries[index - 1]?.tag ?? "") >= entry.tag)) {
    throw new MalformedFont("sfnt table directory is not sorted by tag");
  }
  let sfntSize = 12 + count * 16;
  let offset = 44 + count * 20;
  const offsets: number[] = [];
  for (const entry of entries) {
    sfntSize += align4(entry.data.length);
    offsets.push(offset);
    offset += align4(entry.stored.length);
  }
  const out = new ByteWriter(offset);
  out.tag("wOFF").u32(reader.u32(0)).u32(offset).u16(count).u16(0).u32(sfntSize);
  out.u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  entries.forEach((entry, index) => {
    out
      .tag(entry.tag)
      .u32(offsets[index] ?? 0)
      .u32(entry.stored.length);
    out.u32(entry.data.length).u32(entry.checksum);
  });
  for (const entry of entries) out.bytes(entry.stored).align4();
  return out.result();
}
