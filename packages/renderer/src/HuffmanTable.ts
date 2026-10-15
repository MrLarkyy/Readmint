import type { EntropyBits } from "./EntropyBits.js";

const lookupBits = 9;

/**
 * A Huffman table of a DHT segment with its canonical codes of 1-16 bits (T.81 Annex C), decoded as libjpeg and
 * jpeg-decoder do: by code length against the largest code of each length, the short codes through a lookup.
 */
export class HuffmanTable {
  /** The largest code of each length 1-16, -1 where there is none. */
  private readonly maxCode = new Int32Array(17).fill(-1);
  /** Per length, what turns a code into an index into `symbols`. */
  private readonly offset = new Int32Array(17);
  /** By the next `lookupBits` bits: code length << 8 | symbol, 0 for a longer code or none. */
  private readonly lookup = new Uint16Array(1 << lookupBits);

  /**
   * @param counts the number of codes of each length 1-16, already checked to fit
   * @param symbols the symbols in code order
   * @param allOnes a code is all ones, which libjpeg fails on in a scan that uses the table
   */
  constructor(
    counts: readonly number[],
    readonly symbols: Uint8Array,
    readonly allOnes: boolean,
  ) {
    let code = 0;
    let index = 0;
    for (let length = 1; length <= 16; length++) {
      const count = counts[length - 1] ?? 0;
      this.offset[length] = index - code;
      for (let n = 0; n < count; n++, code++, index++) {
        if (length > lookupBits) continue;
        const shift = lookupBits - length;
        this.lookup.fill((length << 8) | (symbols[index] ?? 0), code << shift, (code + 1) << shift);
      }
      if (count > 0) this.maxCode[length] = code - 1;
      code *= 2;
    }
  }

  /** The largest symbol, for the table checks of libjpeg. */
  get largestSymbol(): number {
    return this.symbols.reduce((largest, symbol) => Math.max(largest, symbol), 0);
  }

  /** The next symbol, its code consumed; undefined where no code of up to 16 bits matches. */
  decode(bits: EntropyBits): number | undefined {
    const next = bits.peek(16);
    const entry = this.lookup[next >>> (16 - lookupBits)] ?? 0;
    if (entry !== 0) {
      bits.skip(entry >> 8);
      return entry & 0xff;
    }
    for (let length = lookupBits + 1; length <= 16; length++) {
      const code = next >>> (16 - length);
      if (code <= (this.maxCode[length] ?? -1)) {
        bits.skip(length);
        return this.symbols[code + (this.offset[length] ?? 0)];
      }
    }
    return undefined;
  }
}
