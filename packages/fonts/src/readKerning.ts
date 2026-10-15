import { MalformedFont } from "./MalformedFont.js";
import { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

/** Horizontal adjustment in font units between two glyphs drawn next to each other. */
export type KerningLookup = (left: number, right: number) => number;

/** A real font uses a handful of kerning lookups and subtables; a crafted one cannot make this loop for long. */
export const maxLookups = 64;
export const maxSubtables = 64;

type PairSubtable = (left: number, right: number) => number | undefined;

/**
 * Pair kerning: the GPOS lookups (type 2, or 9 wrapping 2) of feature `kern` under the default LangSys of script
 * `DFLT`, else `latn`, summed over lookups with the first matching subtable of each; only the first glyph's
 * xAdvance counts. Without such a feature, the horizontal format 0 subtables of a version 0 `kern` table. Each pair
 * is computed once and cached.
 */
export function readKerning(
  reader: SfntReader,
  tables: ReadonlyMap<string, SfntTable>,
): KerningLookup {
  const gpos = tables.get("GPOS");
  const lookups = gpos === undefined ? [] : gposPairLookups(tableReader(reader, gpos));
  const kern = tables.get("kern");
  const raw: KerningLookup =
    lookups.length > 0
      ? (left, right) => sumLookups(lookups, left, right)
      : kern === undefined
        ? () => 0
        : kernTable(tableReader(reader, kern));
  const cache = new Map<number, number>();
  return (left, right) => {
    const key = left * 0x10000 + right;
    let value = cache.get(key);
    if (value === undefined) {
      value = raw(left, right);
      cache.set(key, value);
    }
    return value;
  };
}

function tableReader(reader: SfntReader, table: SfntTable): SfntReader {
  return new SfntReader(reader.slice(table.offset, table.length));
}

function sumLookups(lookups: readonly PairSubtable[][], left: number, right: number): number {
  let total = 0;
  for (const subtables of lookups) {
    for (const subtable of subtables) {
      const value = subtable(left, right);
      if (value !== undefined) {
        total += value;
        break;
      }
    }
  }
  return total;
}

function gposPairLookups(gpos: SfntReader): PairSubtable[][] {
  if (gpos.u16(0) !== 1) return [];
  const indices = kernLookupIndices(gpos, gpos.u16(4), gpos.u16(6));
  const lookupList = gpos.u16(8);
  const count = gpos.u16(lookupList);
  return indices
    .filter((index) => index < count)
    .map((index) => lookupSubtables(gpos, lookupList + gpos.u16(lookupList + 2 + index * 2)));
}

function kernLookupIndices(gpos: SfntReader, scriptList: number, featureList: number): number[] {
  for (const script of ["DFLT", "latn"]) {
    const langSys = defaultLangSys(gpos, scriptList, script);
    if (langSys === undefined) continue;
    const lookups = new Set<number>();
    const featureCount = gpos.u16(featureList);
    for (let index = 0; index < gpos.u16(langSys + 4); index++) {
      const feature = gpos.u16(langSys + 6 + index * 2);
      if (feature >= featureCount) continue;
      const record = featureList + 2 + feature * 6;
      if (gpos.tag(record) !== "kern") continue;
      const table = featureList + gpos.u16(record + 4);
      for (let lookup = 0; lookup < gpos.u16(table + 2); lookup++) {
        lookups.add(gpos.u16(table + 4 + lookup * 2));
        if (lookups.size > maxLookups)
          throw new MalformedFont("font kern feature has too many lookups");
      }
    }
    if (lookups.size > 0) return [...lookups].sort((left, right) => left - right);
  }
  return [];
}

function defaultLangSys(gpos: SfntReader, scriptList: number, tag: string): number | undefined {
  for (let index = 0; index < gpos.u16(scriptList); index++) {
    const record = scriptList + 2 + index * 6;
    if (gpos.tag(record) !== tag) continue;
    const script = scriptList + gpos.u16(record + 4);
    const offset = gpos.u16(script);
    return offset === 0 ? undefined : script + offset;
  }
  return undefined;
}

function lookupSubtables(gpos: SfntReader, lookup: number): PairSubtable[] {
  const type = gpos.u16(lookup);
  const count = gpos.u16(lookup + 4);
  if (count > maxSubtables) throw new MalformedFont("font kerning lookup has too many subtables");
  const subtables: PairSubtable[] = [];
  for (let index = 0; index < count; index++) {
    let subtable = lookup + gpos.u16(lookup + 6 + index * 2);
    let subtableType = type;
    if (type === 9) {
      subtableType = gpos.u16(subtable + 2);
      subtable += gpos.u32(subtable + 4);
    }
    if (subtableType !== 2) continue;
    const format = gpos.u16(subtable);
    if (format === 1) subtables.push(pairFormat1(gpos, subtable));
    else if (format === 2) subtables.push(pairFormat2(gpos, subtable));
  }
  return subtables;
}

function valueSize(format: number): number {
  let size = 0;
  for (let bit = format & 0xff; bit !== 0; bit >>= 1) size += (bit & 1) * 2;
  return size;
}

/** xAdvance of a value record, 0 when its format has none. */
function xAdvance(gpos: SfntReader, record: number, format: number): number {
  return (format & 0x0004) === 0 ? 0 : gpos.i16(record + valueSize(format & 0x0003));
}

function pairFormat1(gpos: SfntReader, subtable: number): PairSubtable {
  const coverage = subtable + gpos.u16(subtable + 2);
  const format1 = gpos.u16(subtable + 4);
  const recordSize = 2 + valueSize(format1) + valueSize(gpos.u16(subtable + 6));
  const setCount = gpos.u16(subtable + 8);
  return (left, right) => {
    const index = coverageIndex(gpos, coverage, left);
    if (index < 0 || index >= setCount) return undefined;
    const set = subtable + gpos.u16(subtable + 10 + index * 2);
    let low = 0;
    let high = gpos.u16(set) - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const record = set + 2 + middle * recordSize;
      const second = gpos.u16(record);
      if (second === right) return xAdvance(gpos, record + 2, format1);
      if (second < right) low = middle + 1;
      else high = middle - 1;
    }
    return undefined;
  };
}

function pairFormat2(gpos: SfntReader, subtable: number): PairSubtable {
  const coverage = subtable + gpos.u16(subtable + 2);
  const format1 = gpos.u16(subtable + 4);
  const recordSize = valueSize(format1) + valueSize(gpos.u16(subtable + 6));
  const classDef1 = subtable + gpos.u16(subtable + 8);
  const classDef2 = subtable + gpos.u16(subtable + 10);
  const class1Count = gpos.u16(subtable + 12);
  const class2Count = gpos.u16(subtable + 14);
  return (left, right) => {
    if (coverageIndex(gpos, coverage, left) < 0) return undefined;
    const class1 = classOf(gpos, classDef1, left);
    const class2 = classOf(gpos, classDef2, right);
    if (class1 >= class1Count || class2 >= class2Count) return undefined;
    const record = subtable + 16 + (class1 * class2Count + class2) * recordSize;
    return xAdvance(gpos, record, format1);
  };
}

function coverageIndex(gpos: SfntReader, coverage: number, glyph: number): number {
  const format = gpos.u16(coverage);
  const count = gpos.u16(coverage + 2);
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (format === 1) {
      const found = gpos.u16(coverage + 4 + middle * 2);
      if (found === glyph) return middle;
      if (found < glyph) low = middle + 1;
      else high = middle - 1;
      continue;
    }
    if (format !== 2) return -1;
    const range = coverage + 4 + middle * 6;
    if (glyph < gpos.u16(range)) high = middle - 1;
    else if (glyph > gpos.u16(range + 2)) low = middle + 1;
    else return gpos.u16(range + 4) + glyph - gpos.u16(range);
  }
  return -1;
}

function classOf(gpos: SfntReader, classDef: number, glyph: number): number {
  const format = gpos.u16(classDef);
  if (format === 1) {
    const start = gpos.u16(classDef + 2);
    const count = gpos.u16(classDef + 4);
    return glyph >= start && glyph < start + count
      ? gpos.u16(classDef + 6 + (glyph - start) * 2)
      : 0;
  }
  if (format !== 2) return 0;
  let low = 0;
  let high = gpos.u16(classDef + 2) - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const range = classDef + 4 + middle * 6;
    if (glyph < gpos.u16(range)) high = middle - 1;
    else if (glyph > gpos.u16(range + 2)) low = middle + 1;
    else return gpos.u16(range + 4);
  }
  return 0;
}

/** Version 0 `kern`: horizontal, non-minimum, non-cross-stream format 0 subtables, summed (or overridden). */
function kernTable(kern: SfntReader): KerningLookup {
  if (kern.u16(0) !== 0) return () => 0;
  const count = Math.min(kern.u16(2), maxSubtables);
  const subtables: { pairs: number; count: number; override: boolean }[] = [];
  let offset = 4;
  for (let index = 0; index < count && offset + 6 <= kern.length; index++) {
    const length = kern.u16(offset + 2);
    const coverage = kern.u16(offset + 4);
    if (coverage >> 8 === 0 && (coverage & 0x07) === 0x01) {
      const pairs = kern.u16(offset + 6);
      kern.slice(offset + 14, pairs * 6);
      subtables.push({ pairs: offset + 14, count: pairs, override: (coverage & 0x08) !== 0 });
    }
    if (length < 6) break;
    offset += length;
  }
  return (left, right) => {
    const key = left * 0x10000 + right;
    let total = 0;
    for (const subtable of subtables) {
      const value = findPair(kern, subtable.pairs, subtable.count, key);
      if (value !== undefined) total = subtable.override ? value : total + value;
    }
    return total;
  };
}

function findPair(kern: SfntReader, pairs: number, count: number, key: number): number | undefined {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const record = pairs + middle * 6;
    const found = kern.u16(record) * 0x10000 + kern.u16(record + 2);
    if (found === key) return kern.i16(record + 4);
    if (found < key) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}
