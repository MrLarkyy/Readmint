import { MalformedFont } from "./MalformedFont.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

const englishUs = 0x0409;

/** A name record in an encoding this reader decodes, whose string lies inside the table. */
export interface NameRecord {
  readonly nameId: number;
  /** 0 Windows Unicode in US English, 1 any Windows Unicode, 2 the Unicode platform, 3 Mac Roman. */
  readonly rank: number;
  readonly offset: number;
  readonly length: number;
  readonly utf16: boolean;
}

export interface NameString {
  readonly nameId: number;
  readonly text: string;
}

/**
 * Code units `readNameStrings` decodes per call, all records together: a crafted table can point every one of its
 * 65535 records at the same 64 KB string.
 */
export const maxNameCodeUnits = 131_072;

/** The decodable records of a name table, in table order. Throws `MalformedFont` when the record array is cut. */
export function nameRecords(reader: SfntReader, name: SfntTable | undefined): NameRecord[] {
  if (name === undefined || name.length < 6) return [];
  const count = reader.u16(name.offset + 2);
  const storage = name.offset + reader.u16(name.offset + 4);
  const end = name.offset + name.length;
  if (6 + count * 12 > name.length) throw new MalformedFont("font name table is truncated");
  const records: NameRecord[] = [];
  for (let index = 0; index < count; index++) {
    const record = name.offset + 6 + index * 12;
    const rank = platformRank(reader.u16(record), reader.u16(record + 2), reader.u16(record + 4));
    if (rank === undefined) continue;
    const length = reader.u16(record + 8);
    const offset = storage + reader.u16(record + 10);
    if (offset + length > end) continue;
    records.push({ nameId: reader.u16(record + 6), rank, offset, length, utf16: rank < 3 });
  }
  return records;
}

/** The string of a record: UTF-16 code units, or Mac Roman with everything above ASCII as U+FFFD. */
export function decodeName(reader: SfntReader, { offset, length, utf16 }: NameRecord): string {
  let text = "";
  if (utf16) {
    for (let index = 0; index + 1 < length; index += 2) {
      text += String.fromCharCode(reader.u16(offset + index));
    }
    return text;
  }
  for (let index = 0; index < length; index++) {
    const byte = reader.u8(offset + index);
    text += String.fromCharCode(byte < 0x80 ? byte : 0xfffd);
  }
  return text;
}

/**
 * The strings of every record whose name id is in `ids`, in table order; a record that would take the decoded total
 * past `maxNameCodeUnits` is left out. Throws `MalformedFont` when the record array is cut.
 */
export function readNameStrings(
  reader: SfntReader,
  name: SfntTable | undefined,
  ids: readonly number[],
): NameString[] {
  const strings: NameString[] = [];
  let left = maxNameCodeUnits;
  for (const record of nameRecords(reader, name)) {
    if (!ids.includes(record.nameId)) continue;
    const units = record.utf16 ? record.length >> 1 : record.length;
    if (units > left) continue;
    left -= units;
    strings.push({ nameId: record.nameId, text: decodeName(reader, record) });
  }
  return strings;
}

function platformRank(platform: number, encoding: number, language: number): number | undefined {
  if (platform === 3 && (encoding === 1 || encoding === 10)) return language === englishUs ? 0 : 1;
  if (platform === 0) return 2;
  if (platform === 1 && encoding === 0) return 3;
  return undefined;
}
