/** Thrown by `Bytes` for a read past the end of the data. */
export class Truncated extends Error {}

/** Fixed-offset reads of untrusted image bytes: every read past the end throws `Truncated`. */
export class Bytes {
  constructor(readonly data: Uint8Array) {}

  u8(offset: number): number {
    const value = this.data[offset];
    if (value === undefined) throw new Truncated();
    return value;
  }

  u16be(offset: number): number {
    return (this.u8(offset) << 8) | this.u8(offset + 1);
  }

  u16le(offset: number): number {
    return this.u8(offset) | (this.u8(offset + 1) << 8);
  }

  u24le(offset: number): number {
    return this.u16le(offset) + this.u8(offset + 2) * 65_536;
  }

  u32be(offset: number): number {
    return this.u16be(offset) * 65_536 + this.u16be(offset + 2);
  }

  u32le(offset: number): number {
    return this.u16le(offset) + this.u16le(offset + 2) * 65_536;
  }

  ascii(offset: number, length: number): string {
    let text = "";
    for (let index = 0; index < length; index++)
      text += String.fromCharCode(this.u8(offset + index));
    return text;
  }

  startsWith(signature: readonly number[]): boolean {
    return signature.every((byte, index) => this.data[index] === byte);
  }
}
