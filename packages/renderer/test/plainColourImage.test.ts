import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { plainColourImage } from "../src/plainColourImage.js";
import { type ImageInfo, sniffImage } from "../src/sniffImage.js";
import { colourImages, iccSegment, inserted } from "./colourImages.js";
import { dataUriBytes, vp8x } from "./exifImages.js";

const assets = join(import.meta.dirname, "assets");
const read = (name: string) => new Uint8Array(readFileSync(join(assets, name)));

function infoOf(data: Uint8Array): ImageInfo {
  const sniffed = sniffImage(data, 1000);
  if (!sniffed.ok) throw new Error(sniffed.message);
  return sniffed.info;
}

/** `data` without the bytes of `info.colourData`, one byte at a time: what the single-pass copy must equal. */
function withoutRanges(data: Uint8Array, info: ImageInfo): number[] {
  return [...data].filter(
    (_byte, index) => !info.colourData.some((range) => index >= range.start && index < range.end),
  );
}

const u32le = (data: Uint8Array, offset: number) =>
  new DataView(data.buffer, data.byteOffset).getUint32(offset, true);

/** A 10-byte ICCP chunk (2 bytes of profile): enough for the walk, which never reads a profile. */
const iccpChunk = new Uint8Array([0x49, 0x43, 0x43, 0x50, 2, 0, 0, 0, 7, 7]);

const stripped = colourImages
  .filter((row) => row.mime !== "image/gif")
  .map((row) => [row.name, dataUriBytes(row.uri)] as const);

describe("plainColourImage", () => {
  test.each(stripped)(
    "%s: exactly the colour data removed, and nothing left to remove",
    (_name, data) => {
      const before = data.slice();
      const info = infoOf(data);
      const plain = plainColourImage(data, info);
      const expected = withoutRanges(data, info);
      if (info.mime === "image/webp") {
        const riff = plain.length - 8;
        expected.splice(4, 4, riff & 255, (riff >>> 8) & 255, (riff >>> 16) & 255, riff >>> 24);
        expected[20] = (expected[20] ?? 0) & ~0x20;
      }
      expect([...plain]).toEqual(expected);
      expect(data).toEqual(before);
      const again = infoOf(plain);
      expect(again).toEqual({ ...info, colourData: [] });
    },
  );

  test("a WebP keeps a correct RIFF size and loses only its ICC flag", () => {
    const data = vp8x(0x28, iccpChunk);
    expect(u32le(data, 4)).toBe(data.length - 8);
    const plain = plainColourImage(data, infoOf(data));
    expect(plain.length).toBe(data.length - 10);
    expect(u32le(plain, 4)).toBe(plain.length - 8);
    expect(plain[20]).toBe(0x08);
  });

  test("a WebP ICC flag without an ICCP chunk is cleared too", () => {
    const data = vp8x(0x20);
    const plain = plainColourImage(data, infoOf(data));
    expect(plain).not.toBe(data);
    expect(plain.length).toBe(data.length);
    expect(plain[20]).toBe(0);
    expect(data[20]).toBe(0x20);
  });

  test("an ICCP chunk past the RIFF payload is no chunk of the image: it stays, and the RIFF size with it", () => {
    const inside = vp8x(0x20, iccpChunk);
    const data = new Uint8Array([...inside, ...iccpChunk]);
    const info = infoOf(data);
    expect(info.colourData).toEqual([{ start: 30, end: 40 }]);
    const plain = plainColourImage(data, info);
    expect([...plain]).toEqual([...plainColourImage(inside, infoOf(inside)), ...iccpChunk]);
    expect(u32le(plain, 4)).toBe(u32le(inside, 4) - 10);
    const trailingOnly = new Uint8Array([...vp8x(0x08), ...iccpChunk]);
    expect(infoOf(trailingOnly).colourData).toEqual([]);
    expect(plainColourImage(trailingOnly, infoOf(trailingOnly))).toBe(trailingOnly);
  });

  test("an ICC profile split over two APP2 segments loses both", () => {
    const jpeg = read("gradient.jpg");
    const split = inserted(jpeg, 2, [
      ...iccSegment(1, 2, [1, 2, 3, 4]),
      ...iccSegment(2, 2, [5, 6, 7, 8]),
    ]);
    const plain = plainColourImage(split, infoOf(split));
    expect([...plain]).toEqual([...jpeg.subarray(0, 20), ...jpeg.subarray(494)]);
  });

  test.each([
    ["pattern.png", read("pattern.png")],
    ["two-frames.gif", read("two-frames.gif")],
    [
      "the GIF with an ICCRGBG1 extension",
      dataUriBytes(colourImages.find((row) => row.mime === "image/gif")?.uri ?? ""),
    ],
  ])("%s without colour data is returned as it is", (_name, data) => {
    expect(plainColourImage(data, infoOf(data))).toBe(data);
  });
});
