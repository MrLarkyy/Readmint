import { describe, expect, test } from "vitest";
import { EntropyBits } from "../src/EntropyBits.js";
import { HuffmanTable } from "../src/HuffmanTable.js";
import { standardHuffmanTables } from "../src/standardHuffmanTables.js";

/** A reader over a bit string, padded with ones, 0xFF stuffed with a zero as an encoder writes it. */
const reader = (bits: string) => {
  const text = bits + "1".repeat((8 - (bits.length % 8)) % 8);
  const bytes: number[] = [];
  for (let at = 0; at < text.length; at += 8) {
    const byte = Number.parseInt(text.slice(at, at + 8), 2);
    bytes.push(...(byte === 0xff ? [0xff, 0] : [byte]));
  }
  return new EntropyBits(new Uint8Array(bytes), 0);
};

describe("HuffmanTable", () => {
  test("decodes the codes of the standard DC luminance table (T.81 Table K.3)", () => {
    const codes = [
      "00",
      "010",
      "011",
      "100",
      "101",
      "110",
      "1110",
      "11110",
      "111110",
      "1111110",
      "11111110",
      "111111110",
    ];
    const bits = reader(codes.join(""));
    const table = standardHuffmanTables.dc[0];
    expect(codes.map(() => table.decode(bits))).toEqual([...codes.keys()]);
    expect(bits.overrun).toBe(false);
  });

  test("decodes codes longer than its lookup, up to 16 bits", () => {
    const table = standardHuffmanTables.ac[0];
    // The last two codes of the AC luminance table: 0xF9 and 0xFA, 16 bits each.
    const bits = reader("1111111111111101" + "1111111111111110" + "1010");
    expect([table.decode(bits), table.decode(bits), table.decode(bits)]).toEqual([0xf9, 0xfa, 0]);
  });

  test("matches no code in sixteen one bits", () => {
    expect(standardHuffmanTables.ac[0].decode(reader("1".repeat(16)))).toBeUndefined();
    expect(standardHuffmanTables.dc[1].decode(reader("1".repeat(16)))).toBeUndefined();
  });

  test("keeps the all-ones flag and knows its largest symbol", () => {
    const counts = [2, ...new Array<number>(15).fill(0)];
    const table = new HuffmanTable(counts, Uint8Array.of(0, 13), true);
    expect(table.allOnes).toBe(true);
    expect(table.largestSymbol).toBe(13);
    expect(table.decode(reader("10"))).toBe(13);
  });
});
