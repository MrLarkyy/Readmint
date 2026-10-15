import { FontRefused } from "./FontRefused.js";
import { inflateExact } from "./inflateExact.js";
import { MalformedFont } from "./MalformedFont.js";
import { maxTables } from "./readTableDirectory.js";
import { SfntReader } from "./SfntReader.js";
import { checkFlavor } from "./sfntFlavor.js";
import { align4, writeSfnt } from "./writeSfnt.js";

interface WoffEntry {
  readonly tag: string;
  readonly offset: number;
  readonly compLength: number;
  readonly origLength: number;
}

const headerSize = 44;
const entrySize = 20;

/**
 * The sfnt inside a WOFF 1.0 file. Every directory entry is checked against the file and the declared sizes against
 * `maxBytes` before anything is inflated; each table must inflate to exactly its declared size.
 */
export function decodeWoff(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const reader = new SfntReader(bytes);
  const flavor = checkFlavor(reader.u32(4), "WOFF");
  const length = reader.u32(8);
  const numTables = reader.u16(12);
  if (length > bytes.length) throw new MalformedFont("WOFF file is shorter than its header says");
  if (reader.u16(14) !== 0) throw new MalformedFont("WOFF header reserved field is not zero");
  if (numTables === 0 || numTables > maxTables) {
    throw new MalformedFont(
      `WOFF declares ${String(numTables)} tables (1 to ${String(maxTables)} allowed)`,
    );
  }
  const declared = reader.u32(16);
  if (declared > maxBytes) throw FontRefused.tooLarge(declared, maxBytes);
  const entries = readEntries(reader, numTables, length);
  let total = 12 + numTables * 16;
  for (const entry of entries) total += align4(entry.origLength);
  if (total > maxBytes) throw FontRefused.tooLarge(total, maxBytes);
  const tables = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (tables.has(entry.tag)) throw new MalformedFont(`WOFF repeats table ${entry.tag}`);
    const data = reader.slice(entry.offset, entry.compLength);
    tables.set(
      entry.tag,
      entry.compLength === entry.origLength ? data : inflateExact(data, entry.origLength),
    );
  }
  return writeSfnt(flavor, tables, false);
}

function readEntries(reader: SfntReader, numTables: number, length: number): WoffEntry[] {
  if (headerSize + numTables * entrySize > length) {
    throw new MalformedFont("WOFF table directory is truncated");
  }
  const entries: WoffEntry[] = [];
  for (let index = 0; index < numTables; index++) {
    const record = headerSize + index * entrySize;
    const entry = {
      tag: reader.tag(record),
      offset: reader.u32(record + 4),
      compLength: reader.u32(record + 8),
      origLength: reader.u32(record + 12),
    };
    if (entry.offset + entry.compLength > length) {
      throw new MalformedFont(`WOFF table ${entry.tag} lies past the end`);
    }
    if (entry.compLength > entry.origLength) {
      throw new MalformedFont(`WOFF table ${entry.tag} is larger compressed than inflated`);
    }
    entries.push(entry);
  }
  return entries;
}
