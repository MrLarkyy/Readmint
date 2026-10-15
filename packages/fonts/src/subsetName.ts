import { ByteWriter } from "./ByteWriter.js";
import { SfntReader } from "./SfntReader.js";

/** Copyright, family, style, unique id, full name, version, PostScript name, licence and its URL, typographic names. */
const keptIds = new Set([0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]);

interface NameRecord {
  readonly platform: number;
  readonly encoding: number;
  readonly language: number;
  readonly id: number;
  readonly text: Uint8Array;
}

/**
 * A format 0 name table with the Windows records of `keptIds` (the records of any platform when the font has no
 * Windows ones), in the font's order. A record pointing outside the table is dropped.
 */
export function subsetName(name: Uint8Array | undefined): Uint8Array {
  const records = name === undefined ? [] : readRecords(new SfntReader(name));
  const windows = records.filter((record) => record.platform === 3);
  const kept = windows.length > 0 ? windows : records;
  const out = new ByteWriter();
  out
    .u16(0)
    .u16(kept.length)
    .u16(6 + kept.length * 12);
  let offset = 0;
  for (const record of kept) {
    out.u16(record.platform).u16(record.encoding).u16(record.language).u16(record.id);
    out.u16(record.text.length).u16(offset);
    offset += record.text.length;
  }
  for (const record of kept) out.bytes(record.text);
  return out.result();
}

function readRecords(reader: SfntReader): NameRecord[] {
  if (reader.length < 6) return [];
  const count = reader.u16(2);
  const storage = reader.u16(4);
  const records: NameRecord[] = [];
  for (let index = 0; index < count && 6 + index * 12 + 12 <= reader.length; index++) {
    const record = 6 + index * 12;
    const id = reader.u16(record + 6);
    const length = reader.u16(record + 8);
    const start = storage + reader.u16(record + 10);
    if (!keptIds.has(id) || start + length > reader.length) continue;
    records.push({
      platform: reader.u16(record),
      encoding: reader.u16(record + 2),
      language: reader.u16(record + 4),
      id,
      text: reader.slice(start, length),
    });
  }
  return records;
}
