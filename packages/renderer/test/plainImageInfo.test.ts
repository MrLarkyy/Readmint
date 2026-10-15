import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { EntropyBudget, maxRenderEntropySteps } from "../src/EntropyBudget.js";
import { plainColourImage } from "../src/plainColourImage.js";
import { plainImageInfo } from "../src/plainImageInfo.js";
import { sniffCache } from "../src/SniffCache.js";
import { type ImageInfo, sniffImage } from "../src/sniffImage.js";
import { uprightImage } from "../src/uprightImage.js";
import {
  colourImages,
  iccBetweenFillAndStray,
  iccSegment,
  inserted,
  jpegMarkerOffsets,
} from "./colourImages.js";
import { dataUriBytes, jpegWithExif, orientationTiff } from "./exifImages.js";

const assets = join(import.meta.dirname, "assets");
const gradient = new Uint8Array(readFileSync(join(assets, "gradient.jpg")));
const progressive = new Uint8Array(readFileSync(join(assets, "jpeg", "progressive.jpg")));

/** The info and the symbol-check steps of `data`, from an empty cache. */
function coldSniff(data: Uint8Array): { readonly info: ImageInfo; readonly steps: number } {
  sniffCache.clear();
  const budget = new EntropyBudget();
  const sniffed = sniffImage(data, 1000, budget);
  sniffCache.clear();
  if (!sniffed.ok) throw new Error(sniffed.message);
  return { info: sniffed.info, steps: maxRenderEntropySteps - budget.remaining };
}

/** The copy `loadImage` writes into the SVG. */
const plainCopy = (data: Uint8Array, info: ImageInfo) =>
  plainColourImage(uprightImage(data, info), info);

const icc = iccSegment(1, 1, [1, 2, 3, 4]);
const iccHead = iccSegment(1, 2, [1, 2]);
const exif6 = (jpeg: Uint8Array) => jpegWithExif(jpeg, orientationTiff(6));
/** The bytes of the APP1 segment `exif6` adds. */
const exif6Length = exif6(gradient).length - gradient.length;

const jpegs: readonly (readonly [string, Uint8Array])[] = [
  ...colourImages
    .filter((row) => row.mime === "image/jpeg")
    .map((row) => [row.name, dataUriBytes(row.uri)] as const),
  ["EXIF orientation 6, big-endian", exif6(gradient)],
  ["EXIF orientation 8, little-endian", jpegWithExif(gradient, orientationTiff(8, true))],
  [
    "EXIF after the frame header behind stray bytes",
    jpegWithExif(gradient, orientationTiff(3), { afterFrame: [0x00, 0x01] }),
  ],
  ["two EXIF blocks", jpegWithExif(exif6(gradient), orientationTiff(3, true))],
  ["an ICC profile before EXIF", inserted(exif6(gradient), 2, icc)],
  ["EXIF before an ICC profile", inserted(exif6(gradient), 2 + exif6Length, icc)],
  [
    "a split ICC profile around EXIF in a progressive JPEG",
    inserted(
      inserted(exif6(progressive), 2, iccHead),
      2 + iccHead.length + exif6Length,
      iccSegment(2, 2, [3, 4]),
    ),
  ],
  [
    "a P3 JPEG with EXIF orientation 6",
    exif6(dataUriBytes(colourImages.find((row) => row.mime === "image/jpeg")?.uri ?? "")),
  ],
  ["an ICC profile between a fill byte and stray bytes", iccBetweenFillAndStray(exif6(gradient))],
];

beforeEach(() => {
  sniffCache.clear();
});

describe("plainImageInfo", () => {
  test.each(jpegs)("%s: what sniffing the plain copy finds, in as many steps", (_name, data) => {
    const original = coldSniff(data);
    const plain = plainCopy(data, original.info);
    expect(plain).not.toBe(data);
    const copy = coldSniff(plain);
    expect(plainImageInfo(original.info)).toEqual(copy.info);
    expect(copy.steps).toBe(original.steps);
  });

  test("the fixtures carry what the copy changes", () => {
    for (const [, data] of jpegs) {
      const { info } = coldSniff(data);
      expect(info.colourData.length + info.orientationFields.length).toBeGreaterThan(0);
    }
  });

  test("a removed ICC range starts at the fill bytes before its marker", () => {
    const frameEnd = (jpegMarkerOffsets(gradient, 0xc0)[0] ?? 0) + 2 + 17;
    const data = iccBetweenFillAndStray(gradient);
    const original = coldSniff(data);
    expect(original.info.colourData.at(-1)).toEqual({
      start: frameEnd,
      end: frameEnd + 1 + icc.length,
    });
    const copy = plainCopy(data, original.info);
    // The gradient's own ICC segment, before the frame header, is removed too.
    const [own] = original.info.colourData;
    const at = frameEnd - ((own?.end ?? 0) - (own?.start ?? 0));
    expect([...copy.subarray(at - 2, at + 2)]).toEqual([
      ...data.subarray(frameEnd - 2, frameEnd),
      0x01,
      0x02,
    ]);
    expect(sniffImage(copy, 1000).ok).toBe(true);
  });

  test("none for other formats", () => {
    const { info } = coldSniff(gradient);
    expect(plainImageInfo({ ...info, mime: "image/png" })).toBeUndefined();
  });
});
