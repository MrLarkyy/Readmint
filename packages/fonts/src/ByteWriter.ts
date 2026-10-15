/** Big-endian writes into a buffer that grows as needed; `result()` is a copy of the written part. */
export class ByteWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private size = 0;

  constructor(capacity = 1024) {
    this.buffer = new Uint8Array(Math.max(16, capacity));
    this.view = new DataView(this.buffer.buffer);
  }

  get length(): number {
    return this.size;
  }

  u8(value: number): this {
    this.grow(1);
    this.view.setUint8(this.size, value & 0xff);
    this.size += 1;
    return this;
  }

  u16(value: number): this {
    this.grow(2);
    this.view.setUint16(this.size, value & 0xffff);
    this.size += 2;
    return this;
  }

  i16(value: number): this {
    this.grow(2);
    this.view.setInt16(this.size, value);
    this.size += 2;
    return this;
  }

  u32(value: number): this {
    this.grow(4);
    this.view.setUint32(this.size, value >>> 0);
    this.size += 4;
    return this;
  }

  i32(value: number): this {
    this.grow(4);
    this.view.setInt32(this.size, value);
    this.size += 4;
    return this;
  }

  tag(tag: string): this {
    for (let index = 0; index < 4; index++) this.u8(tag.charCodeAt(index));
    return this;
  }

  bytes(data: Uint8Array): this {
    this.grow(data.length);
    this.buffer.set(data, this.size);
    this.size += data.length;
    return this;
  }

  /** Zero bytes up to the next multiple of four. */
  align4(): this {
    while (this.size % 4 !== 0) this.u8(0);
    return this;
  }

  setU16(offset: number, value: number): void {
    this.view.setUint16(offset, value & 0xffff);
  }

  setU32(offset: number, value: number): void {
    this.view.setUint32(offset, value >>> 0);
  }

  result(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }

  private grow(extra: number): void {
    if (this.size + extra <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < this.size + extra) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(0, this.size));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }
}
