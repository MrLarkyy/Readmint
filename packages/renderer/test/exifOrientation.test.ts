import { describe, expect, test } from "vitest";
import { exifOrientation } from "../src/exifOrientation.js";
import { orientationEntry, orientationTiff, tiff } from "./exifImages.js";

const read = (block: Uint8Array) => exifOrientation(block, 0, block.length);
const make = { tag: 0x010f, type: 2, count: 4, value: 0 };

/** A big-endian block whose header points IFD0 at `offset`. */
function withIfdOffset(block: Uint8Array, offset: number): Uint8Array {
  const copy = block.slice();
  new DataView(copy.buffer).setUint32(4, offset);
  return copy;
}

describe("exifOrientation", () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8])("reads orientation %i in both byte orders", (value) => {
    expect(read(orientationTiff(value, false))).toEqual({
      orientation: value,
      littleEndian: false,
      entries: [10],
    });
    expect(read(orientationTiff(value, true))).toEqual({
      orientation: value,
      littleEndian: true,
      entries: [10],
    });
  });

  test("reads the block where it lies in the file and skips an Exif prefix", () => {
    const block = orientationTiff(6);
    const data = new Uint8Array(20 + 6 + block.length);
    data.set([0x45, 0x78, 0x69, 0x66, 0, 0], 20);
    data.set(block, 26);
    expect(exifOrientation(data, 20, data.length)).toEqual({
      orientation: 6,
      littleEndian: false,
      entries: [36],
    });
    // Decoders check only `Exif\0`: the sixth byte may be anything.
    data[25] = 0x2a;
    expect(exifOrientation(data, 20, data.length)).toMatchObject({ orientation: 6, entries: [36] });
    data[24] = 0x2a;
    expect(exifOrientation(data, 20, data.length)).toMatchObject({ orientation: 1, entries: [] });
  });

  test.each([
    ["a LONG entry", tiff([orientationEntry(6, 4)])],
    ["a SHORT entry with count 2", tiff([orientationEntry(6, 3, 2)])],
    ["value 9", orientationTiff(9)],
    ["value 0", orientationTiff(0)],
  ])("%s counts as 1 but is still found", (_name, block) => {
    expect(read(block)).toMatchObject({ orientation: 1, entries: [10] });
  });

  test("the first usable entry decides; every Orientation entry is found", () => {
    const block = tiff([orientationEntry(3, 4), make, orientationEntry(8), orientationEntry(6)]);
    expect(read(block)).toEqual({ orientation: 8, littleEndian: false, entries: [10, 34, 46] });
  });

  test("an Orientation entry in IFD1 (the thumbnail) does not count", () => {
    expect(read(tiff([make], { ifd1: [orientationEntry(6)] }))).toEqual({
      orientation: 1,
      littleEndian: false,
      entries: [],
    });
  });

  test.each([
    ["no TIFF byte order", Uint8Array.of(0x58, 0x58, 0, 42, 0, 0, 0, 8)],
    ["a wrong TIFF magic", Uint8Array.of(0x4d, 0x4d, 0, 43, 0, 0, 0, 8)],
    ["a cut-off header", Uint8Array.of(0x4d, 0x4d, 0, 42)],
    ["an IFD offset past the block", withIfdOffset(orientationTiff(6), 0xfffffff0)],
    ["an IFD offset at the block's end", withIfdOffset(orientationTiff(6), 25)],
    ["an empty block", new Uint8Array(0)],
  ])("%s is orientation 1 without entries", (_name, block) => {
    expect(read(block)).toMatchObject({ orientation: 1, entries: [] });
  });

  test("entries are read only within the block, however many IFD0 declares", () => {
    const block = tiff([make, orientationEntry(6)], { declared: 0xffff });
    expect(read(block)).toMatchObject({ orientation: 6, entries: [22] });
    // The block ends inside the Orientation entry: it is not read, even though the data goes on.
    const data = new Uint8Array([...block, 0, 0, 0, 0]);
    expect(exifOrientation(data, 0, 30)).toMatchObject({ orientation: 1, entries: [] });
  });

  test("a block end past the data is clamped to it", () => {
    const block = orientationTiff(6);
    expect(exifOrientation(block, 0, 1_000_000)).toMatchObject({ orientation: 6, entries: [10] });
    expect(exifOrientation(block.subarray(0, 20), 0, 1_000_000)).toMatchObject({
      orientation: 1,
      entries: [],
    });
  });
});
