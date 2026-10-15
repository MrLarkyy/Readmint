import type { SfntReader } from "../SfntReader.js";

/**
 * An OpenType ClassDef table: glyph -> class, 0 for a glyph it does not list. Its arrays are checked to lie inside the
 * table once, when it is read; a null offset or a format this version does not know puts every glyph in class 0.
 */
export class ClassDef {
  private constructor(
    private readonly reader: SfntReader | undefined,
    private readonly records: number,
    private readonly format: number,
    private readonly start: number,
    private readonly count: number,
  ) {}

  static readonly empty = new ClassDef(undefined, 0, 0, 0, 0);

  static read(reader: SfntReader, offset: number): ClassDef {
    const format = reader.u16(offset);
    if (format === 1) {
      const start = reader.u16(offset + 2);
      const count = reader.u16(offset + 4);
      reader.slice(offset + 6, count * 2);
      return new ClassDef(reader, offset + 6, 1, start, count);
    }
    if (format === 2) {
      const count = reader.u16(offset + 2);
      reader.slice(offset + 4, count * 6);
      return new ClassDef(reader, offset + 4, 2, 0, count);
    }
    return ClassDef.empty;
  }

  classOf(glyph: number): number {
    const reader = this.reader;
    if (reader === undefined) return 0;
    if (this.format === 1) {
      const index = glyph - this.start;
      return index >= 0 && index < this.count ? reader.u16(this.records + index * 2) : 0;
    }
    let low = 0;
    let high = this.count - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const range = this.records + middle * 6;
      if (glyph < reader.u16(range)) high = middle - 1;
      else if (glyph > reader.u16(range + 2)) low = middle + 1;
      else return reader.u16(range + 4);
    }
    return 0;
  }
}
