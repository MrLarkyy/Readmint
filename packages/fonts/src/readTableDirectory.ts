import { MalformedFont, type SfntReader } from "./SfntReader.js";

export interface SfntTable {
  readonly offset: number;
  readonly length: number;
}

/** Real fonts carry 10 to 30 tables; the cap keeps a crafted directory from costing anything. */
export const maxTables = 64;

/** The table directory; every table must lie inside the bytes. The first of duplicate tags wins. */
export function readTableDirectory(reader: SfntReader): ReadonlyMap<string, SfntTable> {
  const numTables = reader.u16(4);
  if (numTables === 0 || numTables > maxTables) {
    throw new MalformedFont(
      `font declares ${String(numTables)} tables (1 to ${String(maxTables)} allowed)`,
    );
  }
  if (12 + numTables * 16 > reader.length) {
    throw new MalformedFont("font table directory is truncated");
  }
  const tables = new Map<string, SfntTable>();
  for (let index = 0; index < numTables; index++) {
    const record = 12 + index * 16;
    const tag = reader.tag(record);
    const offset = reader.u32(record + 8);
    const length = reader.u32(record + 12);
    if (offset + length > reader.length)
      throw new MalformedFont(`font table ${tag} lies past the end`);
    if (!tables.has(tag)) tables.set(tag, { offset, length });
  }
  return tables;
}

export function requireTable(
  tables: ReadonlyMap<string, SfntTable>,
  tag: string,
  minLength: number,
): SfntTable {
  const table = tables.get(tag);
  if (table === undefined) throw new MalformedFont(`font has no ${tag} table`);
  if (table.length < minLength) throw new MalformedFont(`font table ${tag} is too short`);
  return table;
}
