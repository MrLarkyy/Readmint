import { MalformedFont } from "./MalformedFont.js";
import type { SfntReader } from "./SfntReader.js";

/** A CFF INDEX: `count` byte strings whose offsets are checked against the data on every access. */
export class CffIndex {
  private constructor(
    private readonly reader: SfntReader,
    readonly count: number,
    private readonly offsetSize: number,
    private readonly offsets: number,
    /** Position of the byte before the data: offsets are 1-based. */
    private readonly base: number,
    /** First byte after the INDEX. */
    readonly end: number,
  ) {}

  static read(reader: SfntReader, offset: number): CffIndex {
    const count = reader.u16(offset);
    if (count === 0) return new CffIndex(reader, 0, 1, offset + 2, offset + 2, offset + 2);
    const offsetSize = reader.u8(offset + 2);
    if (offsetSize < 1 || offsetSize > 4)
      throw new MalformedFont("CFF INDEX offset size is invalid");
    const offsets = offset + 3;
    const base = offsets + (count + 1) * offsetSize - 1;
    const index = new CffIndex(reader, count, offsetSize, offsets, base, 0);
    const end = base + index.offsetAt(count);
    if (end > reader.length) throw new MalformedFont("CFF INDEX lies past the end");
    return new CffIndex(reader, count, offsetSize, offsets, base, end);
  }

  item(index: number): Uint8Array {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new MalformedFont(`CFF INDEX has no item ${String(index)}`);
    }
    const start = this.offsetAt(index);
    const stop = this.offsetAt(index + 1);
    if (start < 1 || stop < start || this.base + stop > this.end) {
      throw new MalformedFont("CFF INDEX offsets are out of order");
    }
    return this.reader.slice(this.base + start, stop - start);
  }

  private offsetAt(index: number): number {
    let value = 0;
    const at = this.offsets + index * this.offsetSize;
    for (let byte = 0; byte < this.offsetSize; byte++)
      value = value * 256 + this.reader.u8(at + byte);
    return value;
  }
}
