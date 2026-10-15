import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, test } from "vitest";
import { sniffImage, type ImageInfo } from "../src/sniffImage.js";
import { uprightImage } from "../src/uprightImage.js";
import {
  jpegWithExif,
  orientationEntry,
  orientationTiff,
  pngWithExif,
  tiff,
} from "./exifImages.js";

const assets = join(import.meta.dirname, "assets");
const png = new Uint8Array(readFileSync(join(assets, "pattern.png")));
const jpeg = new Uint8Array(readFileSync(join(assets, "gradient.jpg")));

function info(data: Uint8Array): ImageInfo {
  const result = sniffImage(data, 1000);
  if (!result.ok) throw new Error(result.message);
  return result.info;
}

/** Every chunk's stored CRC against zlib's, computed independently of the renderer's crc32. */
function pngCrcsValid(data: Uint8Array): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = view.getUint32(offset);
    const end = offset + 8 + length;
    if (crc32(data.subarray(offset + 4, end)) !== view.getUint32(end)) return false;
    offset = end + 4;
  }
  return true;
}

/** The type, count and value field of an IFD entry, read in its byte order. */
function entry(data: Uint8Array, offset: number, littleEndian: boolean) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    type: view.getUint16(offset + 2, littleEndian),
    count: view.getUint32(offset + 4, littleEndian),
    value: [...data.subarray(offset + 8, offset + 12)],
  };
}

const twoEntries = tiff([orientationEntry(6), orientationEntry(8, 4, 2)]);

describe("uprightImage", () => {
  test.each([
    ["png, eXIf before the data", pngWithExif(png, orientationTiff(6))],
    ["png, eXIf after the data", pngWithExif(png, orientationTiff(8), "after-data")],
    ["png, two eXIf chunks", pngWithExif(pngWithExif(png, twoEntries, "after-data"), twoEntries)],
    ["jpeg, big-endian", jpegWithExif(jpeg, orientationTiff(3))],
    [
      "jpeg, little-endian",
      jpegWithExif(jpeg, tiff([orientationEntry(6)], { littleEndian: true })),
    ],
  ])("%s: every Orientation entry says SHORT 1", (_name, data) => {
    const before = data.slice();
    const sniffed = info(data);
    expect(sniffed.orientation).not.toBe(1);
    const upright = uprightImage(data, sniffed);
    expect(upright).not.toBe(data);
    expect(data).toEqual(before);
    expect(upright.length).toBe(data.length);
    for (const field of sniffed.orientationFields) {
      for (const offset of field.entries) {
        expect(entry(upright, offset, field.littleEndian)).toEqual({
          type: 3,
          count: 1,
          value: field.littleEndian ? [1, 0, 0, 0] : [0, 1, 0, 0],
        });
      }
    }
    const again = info(upright);
    expect(again.orientation).toBe(1);
    expect(again.orientationFields.map((field) => field.orientation)).toEqual(
      sniffed.orientationFields.map(() => 1),
    );
    expect(again.exif).toBe(true);
    // Only the entries' type, count and value bytes (and a PNG chunk's CRC) may differ.
    const changed = [...upright.keys()].filter((index) => upright[index] !== data[index]);
    const allowed = new Set(
      sniffed.orientationFields.flatMap((field) => [
        ...field.entries.flatMap((offset) => Array.from({ length: 10 }, (_, i) => offset + 2 + i)),
        ...(field.checksum === undefined
          ? []
          : [0, 1, 2, 3].map((i) => (field.checksum?.end ?? 0) + i)),
      ]),
    );
    expect(changed.every((index) => allowed.has(index))).toBe(true);
  });

  test("a rewritten PNG keeps valid CRCs in every chunk", () => {
    for (const data of [
      pngWithExif(png, orientationTiff(6)),
      pngWithExif(pngWithExif(png, twoEntries, "after-data"), orientationTiff(3, true)),
    ]) {
      expect(pngCrcsValid(data)).toBe(true);
      expect(pngCrcsValid(uprightImage(data, info(data)))).toBe(true);
    }
  });

  test("an image without Orientation entries comes back as the same array", () => {
    for (const data of [png, jpeg, pngWithExif(png, tiff([]))]) {
      expect(uprightImage(data, info(data))).toBe(data);
    }
  });

  test("an image already upright is still a copy, with the same bytes", () => {
    const data = pngWithExif(png, orientationTiff(1));
    const upright = uprightImage(data, info(data));
    expect(upright).not.toBe(data);
    expect(upright).toEqual(data);
  });

  test("a view into a larger buffer is rewritten at its own offsets", () => {
    const data = pngWithExif(png, orientationTiff(6));
    const larger = new Uint8Array(data.length + 16);
    larger.set(data, 16);
    const view = larger.subarray(16);
    const upright = uprightImage(view, info(view));
    expect(info(upright).orientation).toBe(1);
    expect(pngCrcsValid(upright)).toBe(true);
    expect(larger.subarray(16)).toEqual(data);
  });
});
