import { zlibSync } from "fflate";

/** A WOFF 1.0 file of a TrueType font: each table zlib-compressed when that is smaller (a test fixture writer). */
export function encodeWoff(sfnt: Uint8Array): Uint8Array {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const numTables = view.getUint16(4);
  const tables = Array.from({ length: numTables }, (_, index) => {
    const record = 12 + index * 16;
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    const data = sfnt.subarray(offset, offset + length);
    const compressed = zlibSync(data, { level: 9 });
    return {
      tag: view.getUint32(record),
      checksum: view.getUint32(record + 4),
      origLength: length,
      stored: compressed.length < length ? compressed : data,
    };
  });
  const pad = (length: number): number => (4 - (length % 4)) % 4;
  const directoryEnd = 44 + numTables * 20;
  const total =
    directoryEnd +
    tables.reduce((sum, table) => sum + table.stored.length + pad(table.stored.length), 0);
  const out = new Uint8Array(total);
  const write = new DataView(out.buffer);
  write.setUint32(0, 0x774f4646);
  write.setUint32(4, view.getUint32(0));
  write.setUint32(8, total);
  write.setUint16(12, numTables);
  write.setUint32(
    16,
    12 +
      numTables * 16 +
      tables.reduce((sum, table) => sum + table.origLength + pad(table.origLength), 0),
  );
  let at = directoryEnd;
  tables.forEach((table, index) => {
    const entry = 44 + index * 20;
    write.setUint32(entry, table.tag);
    write.setUint32(entry + 4, at);
    write.setUint32(entry + 8, table.stored.length);
    write.setUint32(entry + 12, table.origLength);
    write.setUint32(entry + 16, table.checksum);
    out.set(table.stored, at);
    at += table.stored.length + pad(table.stored.length);
  });
  return out;
}
