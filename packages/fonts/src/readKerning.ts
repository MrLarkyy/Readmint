import type { SfntReader } from "./SfntReader.js";

/** Horizontal adjustment in font units between two glyphs drawn next to each other. */
export type KerningLookup = (left: number, right: number) => number;

/** Subtables of a kern table read; a real font has one or two. */
export const maxSubtables = 64;

/**
 * Version 0 `kern`: horizontal, non-minimum, non-cross-stream format 0 subtables, summed (or overridden); undefined
 * when the table has none. Fonts kern through GPOS when it has kern lookups; this is the fallback for older fonts.
 */
export function readKerning(kern: SfntReader | undefined): KerningLookup | undefined {
  if (kern === undefined || kern.length < 4 || kern.u16(0) !== 0) return undefined;
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
  if (subtables.length === 0) return undefined;
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
