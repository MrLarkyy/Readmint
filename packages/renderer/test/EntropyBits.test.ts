import { describe, expect, test } from "vitest";
import { EntropyBits } from "../src/EntropyBits.js";

/** Bytes of a bit string, padded with ones. */
const bitBytes = (bits: string) => {
  const text = bits + "1".repeat((8 - (bits.length % 8)) % 8);
  return Uint8Array.from({ length: text.length / 8 }, (_, index) =>
    Number.parseInt(text.slice(index * 8, index * 8 + 8), 2),
  );
};

describe("EntropyBits", () => {
  test("reads bits across bytes from the start offset", () => {
    const bits = new EntropyBits(new Uint8Array([0x99, ...bitBytes("1010110011110000")]), 1);
    expect(bits.read(3)).toBe(0b101);
    expect(bits.read(9)).toBe(0b011001111);
    expect(bits.peek(4)).toBe(0);
    expect(bits.overrun).toBe(false);
  });

  test("reads a stuffed zero as the data byte 0xFF", () => {
    const bits = new EntropyBits(new Uint8Array([0xff, 0x00, 0x12]), 0);
    expect(bits.read(8)).toBe(0xff);
    expect(bits.read(8)).toBe(0x12);
    expect(bits.overrun).toBe(false);
  });

  test("stops at a marker and supplies zero bits past it, recording the overrun", () => {
    const bits = new EntropyBits(new Uint8Array([0x12, 0xff, 0xff, 0xd9, 0x34]), 0);
    expect(bits.read(8)).toBe(0x12);
    expect(bits.overrun).toBe(false);
    expect(bits.read(8)).toBe(0);
    expect(bits.overrun).toBe(true);
    expect(bits.atMarker).toBe(true);
    expect(bits.marker).toBe(0xd9);
  });

  test("past the end of the bytes supplies zero bits without a marker", () => {
    const bits = new EntropyBits(new Uint8Array([0xf0]), 0);
    expect(bits.read(12)).toBe(0xf00);
    expect(bits.overrun).toBe(true);
    expect(bits.atMarker).toBe(false);
    expect(bits.marker).toBeUndefined();
  });

  test("stops at fill bytes before a stuffed zero as marker 0", () => {
    const bits = new EntropyBits(new Uint8Array([0xff, 0xff, 0x00]), 0);
    expect(bits.read(1)).toBe(0);
    expect(bits.marker).toBe(0);
  });

  test("is short where a code could take only padding", () => {
    const bits = new EntropyBits(new Uint8Array([0xab, 0xff, 0xd9]), 0);
    expect(bits.peek(16)).toBe(0xab00);
    expect(bits.short).toBe(true);
    expect(new EntropyBits(new Uint8Array([1, 2, 3]), 0).short).toBe(false);
  });

  test("passes the restart marker in sequence after the padding bits, fill bytes allowed", () => {
    const bits = new EntropyBits(new Uint8Array([0b10111111, 0xff, 0xff, 0xd3, 0xcd]), 0);
    expect(bits.read(2)).toBe(0b10);
    bits.align();
    expect(bits.moreData()).toBe(false);
    expect(bits.restart(2)).toBe(false);
    expect(bits.restart(3)).toBe(true);
    expect(bits.read(8)).toBe(0xcd);
    expect(bits.overrun).toBe(false);
  });

  test("finds data left before a restart marker", () => {
    const bits = new EntropyBits(new Uint8Array([0x80, 0x12, 0xff, 0xd0]), 0);
    bits.read(1);
    bits.align();
    expect(bits.moreData()).toBe(true);
    bits.skipToStop();
    expect(bits.marker).toBe(0xd0);
  });

  test("skips more than 16 bits at once", () => {
    const bits = new EntropyBits(new Uint8Array([1, 2, 3, 4, 5]), 0);
    bits.skip(33);
    expect(bits.read(7)).toBe(0b0000101);
    expect(bits.overrun).toBe(false);
  });
});
