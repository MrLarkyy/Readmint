import { MalformedFont } from "./MalformedFont.js";

/** Big-endian reads that fail with `MalformedFont` instead of reading outside the bytes. */
export class SfntReader {
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  u8(offset: number): number {
    this.need(offset, 1);
    return this.view.getUint8(offset);
  }

  i8(offset: number): number {
    this.need(offset, 1);
    return this.view.getInt8(offset);
  }

  u16(offset: number): number {
    this.need(offset, 2);
    return this.view.getUint16(offset);
  }

  i16(offset: number): number {
    this.need(offset, 2);
    return this.view.getInt16(offset);
  }

  u32(offset: number): number {
    this.need(offset, 4);
    return this.view.getUint32(offset);
  }

  i32(offset: number): number {
    this.need(offset, 4);
    return this.view.getInt32(offset);
  }

  tag(offset: number): string {
    return String.fromCharCode(
      this.u8(offset),
      this.u8(offset + 1),
      this.u8(offset + 2),
      this.u8(offset + 3),
    );
  }

  /** `length` bytes at `offset`, shared with the input. */
  slice(offset: number, length: number): Uint8Array {
    this.need(offset, length);
    return this.bytes.subarray(offset, offset + length);
  }

  private need(offset: number, size: number): void {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(size) ||
      offset < 0 ||
      size < 0 ||
      offset + size > this.bytes.byteLength
    ) {
      throw new MalformedFont("font data ends inside a table");
    }
  }
}
