import type { SfntReader } from "../SfntReader.js";

/**
 * An OpenType Coverage table: glyph -> coverage index by binary search. Its record array is checked to lie inside
 * the table once, when it is read; a format this version does not know covers nothing.
 */
export class Coverage {
  private constructor(
    private readonly reader: SfntReader,
    private readonly records: number,
    private readonly format: number,
    /** Glyphs (format 1) or ranges (format 2). */
    readonly count: number,
  ) {}

  static read(reader: SfntReader, offset: number): Coverage {
    const format = reader.u16(offset);
    const count = format === 1 || format === 2 ? reader.u16(offset + 2) : 0;
    reader.slice(offset + 4, count * (format === 1 ? 2 : 6));
    return new Coverage(reader, offset + 4, format, count);
  }

  /** The coverage index of a glyph, -1 when it is not covered. */
  index(glyph: number): number {
    const reader = this.reader;
    let low = 0;
    let high = this.count - 1;
    if (this.format === 1) {
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const found = reader.u16(this.records + middle * 2);
        if (found === glyph) return middle;
        if (found < glyph) low = middle + 1;
        else high = middle - 1;
      }
      return -1;
    }
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const range = this.records + middle * 6;
      if (glyph < reader.u16(range)) high = middle - 1;
      else if (glyph > reader.u16(range + 2)) low = middle + 1;
      else return reader.u16(range + 4) + glyph - reader.u16(range);
    }
    return -1;
  }

  /** Every covered glyph range, in table order (a single glyph is a range of one). */
  forEachRange(visit: (start: number, end: number) => void): void {
    for (let index = 0; index < this.count; index++) {
      if (this.format === 1) {
        const glyph = this.reader.u16(this.records + index * 2);
        visit(glyph, glyph);
      } else {
        const range = this.records + index * 6;
        visit(this.reader.u16(range), this.reader.u16(range + 2));
      }
    }
  }
}
