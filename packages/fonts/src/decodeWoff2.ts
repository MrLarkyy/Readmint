// brotli ships no types: the reference brings its declaration into every program that reaches this file.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./brotli.d.ts" />
import decompress from "brotli/decompress.js";
import { ByteCursor } from "./ByteCursor.js";
import { FontRefused } from "./FontRefused.js";
import { MalformedFont } from "./MalformedFont.js";
import { maxTables } from "./readTableDirectory.js";
import { reconstructGlyf, type ReconstructedGlyf } from "./reconstructGlyf.js";
import { reconstructHmtx } from "./reconstructHmtx.js";
import { checkFlavor, COLLECTION_FLAVOR } from "./sfntFlavor.js";
import { woff2Tags } from "./woff2Tags.js";
import { align4, writeSfnt } from "./writeSfnt.js";

interface Woff2Entry {
  readonly tag: string;
  readonly origLength: number;
  /** Bytes of the table in the decompressed stream. */
  readonly streamLength: number;
  readonly transformed: boolean;
}

const headerSize = 48;

/**
 * The sfnt inside a WOFF2 file. The declared sizes are checked against `maxBytes` before decompressing, Brotli
 * writes into a buffer of exactly the declared stream size (more is an error, not a reallocation), and the glyf, loca
 * and hmtx transforms are reversed. Collections are unsupported.
 */
export function decodeWoff2(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const cursor = new ByteCursor(bytes);
  cursor.u32();
  const rawFlavor = cursor.u32();
  if (rawFlavor === COLLECTION_FLAVOR) {
    throw new FontRefused(
      "unsupported",
      "font collections (WOFF2 with several fonts) are not supported",
    );
  }
  const flavor = checkFlavor(rawFlavor, "WOFF2");
  if (cursor.u32() > bytes.length)
    throw new MalformedFont("WOFF2 file is shorter than its header says");
  const numTables = cursor.u16();
  if (cursor.u16() !== 0) throw new MalformedFont("WOFF2 header reserved field is not zero");
  if (numTables === 0 || numTables > maxTables) {
    throw new MalformedFont(
      `WOFF2 declares ${String(numTables)} tables (1 to ${String(maxTables)} allowed)`,
    );
  }
  const totalSfntSize = cursor.u32();
  if (totalSfntSize > maxBytes) throw FontRefused.tooLarge(totalSfntSize, maxBytes);
  const compressedSize = cursor.u32();
  cursor.position = headerSize;
  const entries = readEntries(cursor, numTables);
  let declared = 12 + numTables * 16;
  let streamSize = 0;
  for (const entry of entries) {
    declared += align4(entry.origLength);
    streamSize += entry.streamLength;
  }
  if (declared > maxBytes) throw FontRefused.tooLarge(declared, maxBytes);
  if (streamSize > maxBytes) throw FontRefused.tooLarge(streamSize, maxBytes);
  const stream = inflate(cursor.take(compressedSize), streamSize);
  return writeSfnt(flavor, buildTables(entries, stream, maxBytes), false);
}

function readEntries(cursor: ByteCursor, numTables: number): Woff2Entry[] {
  const entries: Woff2Entry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < numTables; index++) {
    const flags = cursor.u8();
    const tag = (flags & 0x3f) === 0x3f ? cursor.tag() : (woff2Tags[flags & 0x3f] ?? "");
    if (seen.has(tag)) throw new MalformedFont(`WOFF2 repeats table ${tag}`);
    seen.add(tag);
    const version = flags >> 6;
    const origLength = cursor.base128();
    const transformed = isTransformed(tag, version);
    const streamLength = transformed ? cursor.base128() : origLength;
    if (tag === "loca" && transformed && streamLength !== 0) {
      throw new MalformedFont("WOFF2 transformed loca is not empty");
    }
    entries.push({ tag, origLength, streamLength, transformed });
  }
  const glyf = entries.find((entry) => entry.tag === "glyf");
  const loca = entries.find((entry) => entry.tag === "loca");
  if ((glyf?.transformed ?? false) !== (loca?.transformed ?? false)) {
    throw new MalformedFont("WOFF2 transforms only one of glyf and loca");
  }
  return entries;
}

function isTransformed(tag: string, version: number): boolean {
  if (tag === "glyf" || tag === "loca") {
    if (version === 0) return true;
    if (version === 3) return false;
  } else if (version === 0) return false;
  else if (tag === "hmtx" && version === 1) return true;
  throw new MalformedFont(`WOFF2 table ${tag} uses an unknown transform`);
}

function inflate(compressed: Uint8Array, size: number): Uint8Array {
  let stream: Uint8Array;
  try {
    stream = decompress(compressed, size);
  } catch {
    throw new MalformedFont(
      "WOFF2 data is not valid Brotli or decompresses past its declared size",
    );
  }
  if (stream.length !== size)
    throw new MalformedFont("WOFF2 data decompresses to fewer bytes than declared");
  return stream;
}

function buildTables(
  entries: readonly Woff2Entry[],
  stream: Uint8Array,
  maxBytes: number,
): Map<string, Uint8Array> {
  const tables = new Map<string, Uint8Array>();
  const transformed = new Map<string, Uint8Array>();
  let offset = 0;
  for (const entry of entries) {
    const data = stream.subarray(offset, offset + entry.streamLength);
    offset += entry.streamLength;
    if (entry.transformed) transformed.set(entry.tag, data);
    else tables.set(entry.tag, data);
  }
  const glyf = transformed.get("glyf");
  if (glyf === undefined) {
    if (transformed.has("hmtx")) throw new MalformedFont("WOFF2 transforms hmtx without glyf");
    return tables;
  }
  const rebuilt = reconstructGlyf(glyf, maxBytes);
  checkRebuilt(rebuilt, entries, tables);
  tables.set("glyf", rebuilt.glyf);
  tables.set("loca", rebuilt.loca);
  const hmtx = transformed.get("hmtx");
  if (hmtx !== undefined) {
    const hhea = new ByteCursor(tables.get("hhea") ?? new Uint8Array(0), 34);
    tables.set("hmtx", reconstructHmtx(hmtx, hhea.u16(), rebuilt.xMins));
  }
  return tables;
}

function checkRebuilt(
  rebuilt: ReconstructedGlyf,
  entries: readonly Woff2Entry[],
  tables: ReadonlyMap<string, Uint8Array>,
): void {
  const loca = entries.find((entry) => entry.tag === "loca");
  if (loca?.origLength !== rebuilt.loca.length) {
    throw new MalformedFont("WOFF2 loca length does not match the glyph count");
  }
  const head = new ByteCursor(tables.get("head") ?? new Uint8Array(0), 50);
  if (head.i16() !== rebuilt.indexFormat) {
    throw new MalformedFont("WOFF2 glyf index format differs from head");
  }
}
