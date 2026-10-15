import { Unzlib } from "fflate";
import { RasterError } from "./RasterError.js";

const headerLength = 44;
const entryLength = 20;
/** Input bytes inflated per step: an output past the table's size stops at most one step later. */
const inflateStep = 1024;

interface WoffTable {
  readonly tag: number;
  readonly offset: number;
  readonly compLength: number;
  readonly origLength: number;
  readonly checksum: number;
}

class TooLong extends Error {}

/**
 * The TrueType or OpenType font inside a WOFF 1.0 file. Everything is checked before anything is inflated: the
 * header and table directory lie inside the file, each table's data too, no table is stored larger than it is, and
 * the tables together are at most `maxBytes` once decoded. Each table then inflates to exactly its declared size,
 * stopping as soon as it would pass it. Anything else is a `raster-font` error.
 */
export function decodeWoff(woff: Uint8Array, maxBytes: number, label: string): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  const fail = (reason: string): never => {
    throw new RasterError("raster-font", `${label} is a WOFF font that cannot be read: ${reason}`);
  };
  if (woff.length < headerLength || view.getUint32(0) !== 0x774f4646) fail("the header is invalid");
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  if (numTables === 0) fail("it holds no table");
  if (headerLength + numTables * entryLength > woff.length)
    fail("the table directory is truncated");
  const tables: WoffTable[] = [];
  let decodedBytes = 12 + numTables * 16;
  for (let index = 0; index < numTables; index++) {
    const at = headerLength + index * entryLength;
    const table = {
      tag: view.getUint32(at),
      offset: view.getUint32(at + 4),
      compLength: view.getUint32(at + 8),
      origLength: view.getUint32(at + 12),
      checksum: view.getUint32(at + 16),
    };
    if (table.offset + table.compLength > woff.length) fail("a table lies outside the file");
    if (table.compLength > table.origLength) fail("a table is stored larger than it is");
    decodedBytes += table.origLength + padding(table.origLength);
    tables.push(table);
  }
  if (decodedBytes > maxBytes) {
    fail(`it decodes to ${String(decodedBytes)} bytes, more than the ${String(maxBytes)} allowed`);
  }
  const sfnt = new Uint8Array(decodedBytes);
  const out = new DataView(sfnt.buffer);
  let entrySelector = 0;
  while (2 ** (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = 2 ** entrySelector * 16;
  out.setUint32(0, flavor);
  out.setUint16(4, numTables);
  out.setUint16(6, searchRange);
  out.setUint16(8, entrySelector);
  out.setUint16(10, numTables * 16 - searchRange);
  let dataAt = 12 + numTables * 16;
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    out.setUint32(record, table.tag);
    out.setUint32(record + 4, table.checksum);
    out.setUint32(record + 8, dataAt);
    out.setUint32(record + 12, table.origLength);
    const stored = woff.subarray(table.offset, table.offset + table.compLength);
    const target = sfnt.subarray(dataAt, dataAt + table.origLength);
    if (table.compLength === table.origLength) target.set(stored);
    else if (!inflateInto(stored, target)) fail("a table does not inflate to its declared size");
    dataAt += table.origLength + padding(table.origLength);
  });
  return sfnt;
}

function inflateInto(stored: Uint8Array, target: Uint8Array): boolean {
  let filled = 0;
  const inflater = new Unzlib((chunk) => {
    if (filled + chunk.length > target.length) throw new TooLong();
    target.set(chunk, filled);
    filled += chunk.length;
  });
  try {
    for (let at = 0; at < stored.length; at += inflateStep) {
      const end = Math.min(at + inflateStep, stored.length);
      inflater.push(stored.subarray(at, end), end === stored.length);
    }
  } catch {
    // A table that inflates past its size (TooLong) or a corrupt stream: both refuse the font.
    return false;
  }
  return filled === target.length;
}

function padding(length: number): number {
  return (4 - (length % 4)) % 4;
}
