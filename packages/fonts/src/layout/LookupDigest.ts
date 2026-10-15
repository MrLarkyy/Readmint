/** Glyph ranges wider than this saturate the digest instead of being added glyph by glyph. */
const wideRange = 256;

/**
 * A Bloom-style set of the glyphs a lookup's subtables can start on (HarfBuzz's set digest): two 256-bit masks over
 * different bits of the glyph id. `mayHave` false means no subtable covers the glyph, so a lookup pass skips glyphs
 * without probing a single Coverage table.
 */
export class LookupDigest {
  private readonly bits = new Uint32Array(16);

  add(start: number, end: number): void {
    if (end - start >= wideRange) {
      this.bits.fill(0xffffffff);
      return;
    }
    for (let glyph = start; glyph <= end; glyph++) {
      this.set(glyph & 255);
      this.set(256 + ((glyph >> 4) & 255));
    }
  }

  /** Adds every glyph `other` may have. */
  merge(other: LookupDigest): void {
    for (let word = 0; word < this.bits.length; word++) {
      this.bits[word] = (this.bits[word] ?? 0) | (other.bits[word] ?? 0);
    }
  }

  mayHave(glyph: number): boolean {
    return this.has(glyph & 255) && this.has(256 + ((glyph >> 4) & 255));
  }

  private set(bit: number): void {
    const word = bit >>> 5;
    this.bits[word] = (this.bits[word] ?? 0) | (1 << (bit & 31));
  }

  private has(bit: number): boolean {
    return ((this.bits[bit >>> 5] ?? 0) & (1 << (bit & 31))) !== 0;
  }
}
