import { MalformedFont } from "./MalformedFont.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

const englishUs = 0x0409;

interface Candidate {
  readonly rank: number;
  readonly offset: number;
  readonly length: number;
  readonly utf16: boolean;
}

/**
 * Name 16 (typographic family) before name 1; within each, Windows Unicode in US English, then any Windows
 * Unicode, then the Unicode platform, then Mac Roman (ASCII only). Empty when the font names no family.
 */
export function readFamilyName(reader: SfntReader, name: SfntTable | undefined): string {
  if (name === undefined || name.length < 6) return "";
  const count = reader.u16(name.offset + 2);
  const storage = name.offset + reader.u16(name.offset + 4);
  const end = name.offset + name.length;
  if (6 + count * 12 > name.length) throw new MalformedFont("font name table is truncated");
  let best: Candidate | undefined;
  for (let index = 0; index < count; index++) {
    const record = name.offset + 6 + index * 12;
    const nameId = reader.u16(record + 6);
    if (nameId !== 16 && nameId !== 1) continue;
    const rank = platformRank(reader.u16(record), reader.u16(record + 2), reader.u16(record + 4));
    if (rank === undefined) continue;
    const length = reader.u16(record + 8);
    const offset = storage + reader.u16(record + 10);
    if (offset + length > end) continue;
    const candidate = { rank: rank + (nameId === 16 ? 0 : 4), offset, length, utf16: rank < 3 };
    if (best === undefined || candidate.rank < best.rank) best = candidate;
  }
  return best === undefined ? "" : decode(reader, best);
}

function platformRank(platform: number, encoding: number, language: number): number | undefined {
  if (platform === 3 && (encoding === 1 || encoding === 10)) return language === englishUs ? 0 : 1;
  if (platform === 0) return 2;
  if (platform === 1 && encoding === 0) return 3;
  return undefined;
}

function decode(reader: SfntReader, { offset, length, utf16 }: Candidate): string {
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
