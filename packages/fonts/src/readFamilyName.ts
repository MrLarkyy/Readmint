import { decodeName, nameRecords, type NameRecord } from "./readNameStrings.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

/**
 * Name 16 (typographic family) before name 1; within each, Windows Unicode in US English, then any Windows
 * Unicode, then the Unicode platform, then Mac Roman (ASCII only). Empty when the font names no family.
 */
export function readFamilyName(reader: SfntReader, name: SfntTable | undefined): string {
  let best: NameRecord | undefined;
  let bestRank = Infinity;
  for (const record of nameRecords(reader, name)) {
    if (record.nameId !== 16 && record.nameId !== 1) continue;
    const rank = record.rank + (record.nameId === 16 ? 0 : 4);
    if (rank < bestRank) {
      best = record;
      bestRank = rank;
    }
  }
  return best === undefined ? "" : decodeName(reader, best);
}
