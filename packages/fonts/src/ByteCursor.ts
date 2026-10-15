import { MalformedFont } from "./MalformedFont.js";
import { SfntReader } from "./SfntReader.js";

/** Sequential big-endian reads from `position` up to `end`; every read past `end` is `MalformedFont`. */
export class ByteCursor {
  private readonly reader: SfntReader;

  constructor(
    bytes: Uint8Array,
    public position = 0,
    readonly end = bytes.length,
  ) {
    this.reader = new SfntReader(bytes.subarray(0, Math.min(end, bytes.length)));
  }

  get remaining(): number {
    return this.reader.length - this.position;
  }

  u8(): number {
    const value = this.reader.u8(this.position);
    this.position += 1;
    return value;
  }

  i8(): number {
    const value = this.reader.i8(this.position);
    this.position += 1;
    return value;
  }

  u16(): number {
    const value = this.reader.u16(this.position);
    this.position += 2;
    return value;
  }

  i16(): number {
    const value = this.reader.i16(this.position);
    this.position += 2;
    return value;
  }

  u32(): number {
    const value = this.reader.u32(this.position);
    this.position += 4;
    return value;
  }

  tag(): string {
    const value = this.reader.tag(this.position);
    this.position += 4;
    return value;
  }

  /** The next `length` bytes, shared with the input. */
  take(length: number): Uint8Array {
    const value = this.reader.slice(this.position, length);
    this.position += length;
    return value;
  }

  /** WOFF2 UIntBase128: at most five bytes, no leading zero byte, no value above 2^32 - 1. */
  base128(): number {
    let value = 0;
    for (let index = 0; index < 5; index++) {
      const byte = this.u8();
      if (index === 0 && byte === 0x80) throw new MalformedFont("WOFF2 number has a leading zero");
      if (value > 0x1ffffff) throw new MalformedFont("WOFF2 number overflows 32 bits");
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new MalformedFont("WOFF2 number is longer than five bytes");
  }

  /** WOFF2 255UInt16. */
  uint255(): number {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}
