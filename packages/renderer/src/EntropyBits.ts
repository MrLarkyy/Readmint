/**
 * A bit reader over the entropy-coded data of one scan, from `start`, as libjpeg and jpeg-decoder read it: `FF 00` is
 * the data byte 0xFF, any other 0xFF (after fill bytes) starts a marker, where the data stops. Past that stop the
 * reader supplies zero bits, as both decoders do, and records in `overrun` that a read took one of them. `FF FF 00`
 * (fill bytes before a stuffed zero) stops the data as marker 0: the marker walk refuses it.
 */
export class EntropyBits {
  /** The marker the data stopped at, 0 for fill bytes before a stuffed zero; undefined while reading or at the end. */
  marker: number | undefined;
  /** Some read took bits past the data. */
  overrun = false;
  private position: number;
  /** Where reading resumes past the marker code. */
  private resume = 0;
  private stopped = false;
  private buffer = 0;
  private count = 0;
  /** The low bits of `buffer` that are zeros supplied past the data. */
  private padding = 0;

  constructor(
    private readonly data: Uint8Array,
    start: number,
  ) {
    this.position = start;
  }

  /** The next `count` (at most 16) bits, without consuming them. */
  peek(count: number): number {
    this.fill(count);
    return (this.buffer >>> (this.count - count)) & ((1 << count) - 1);
  }

  /** Consumes `count` bits (any number). */
  skip(count: number): void {
    let left = count;
    while (left > 16) {
      this.skip(16);
      left -= 16;
    }
    this.fill(left);
    if (left > this.count - this.padding) this.overrun = true;
    this.count -= left;
    this.padding = Math.min(this.padding, this.count);
    this.buffer &= (1 << this.count) - 1;
  }

  /** Reads `count` (at most 16) bits as an unsigned number. */
  read(count: number): number {
    const value = this.peek(count);
    this.skip(count);
    return value;
  }

  /** Drops the bits left of the current byte: padding, which neither decoder checks. */
  align(): void {
    this.skip((this.count - this.padding) % 8);
  }

  /** After `align`: true where data bytes are left before the stop. */
  moreData(): boolean {
    if (this.count - this.padding > 0) return true;
    const byte = this.nextByte();
    if (byte === undefined) return false;
    this.buffer = ((this.buffer << 8) | byte) >>> 0;
    this.count += 8;
    return true;
  }

  /**
   * After `align` and with no data left: true where the data stopped at restart marker `index` (0-7), which is then
   * passed and reading goes on behind it.
   */
  restart(index: number): boolean {
    if (this.marker !== 0xd0 + index) return false;
    this.position = this.resume;
    this.marker = undefined;
    this.stopped = false;
    this.buffer = 0;
    this.count = 0;
    this.padding = 0;
    return true;
  }

  /** True where the data stopped at a marker, false where it runs to the end of the bytes or is still being read. */
  get atMarker(): boolean {
    return this.marker !== undefined;
  }

  /** True where the data has stopped and fewer than 16 of its bits are left: a code that matched none took padding. */
  get short(): boolean {
    return this.stopped && this.count - this.padding < 16;
  }

  /** Reads on to where the data stops. */
  skipToStop(): void {
    while (this.nextByte() !== undefined);
    this.buffer = 0;
    this.count = 0;
    this.padding = 0;
  }

  private fill(count: number): void {
    while (this.count < count) {
      const byte = this.nextByte();
      this.buffer = ((this.buffer << 8) | (byte ?? 0)) >>> 0;
      this.count += 8;
      if (byte === undefined) this.padding += 8;
    }
  }

  private nextByte(): number | undefined {
    if (this.stopped) return undefined;
    const byte = this.data[this.position];
    if (byte === undefined) {
      this.stopped = true;
      return undefined;
    }
    if (byte !== 0xff) {
      this.position++;
      return byte;
    }
    let at = this.position + 1;
    while (this.data[at] === 0xff) at++;
    const code = this.data[at];
    if (code === 0 && at === this.position + 1) {
      this.position += 2;
      return 0xff;
    }
    this.stopped = true;
    if (code !== undefined) {
      this.marker = code;
      this.resume = at + 1;
    }
    return undefined;
  }
}
