import { describe, expect, test } from "vitest";
import { EntropyBudget, maxRenderEntropySteps } from "../src/EntropyBudget.js";
import { renderSvg } from "../src/index.js";
import { sniffCache } from "../src/SniffCache.js";
import { sniffImage } from "../src/sniffImage.js";
import gradientJpeg from "./assets/gradient.jpg?inline";
import { colourDesign, colourImages } from "./colourImages.js";
import { dataUriBytes, toDataUri } from "./exifImages.js";
import {
  costlyProgressiveJpeg,
  costlyProgressiveSteps,
  jpegEntropyCases,
} from "./jpegEntropyCases.js";
import { jpegFrameFixtures } from "./jpegFrameTypes.js";
import { type DrawnOutcome, drawnOutcome, jpegStructureCases } from "./jpegStructureCases.js";
import { acceptedJpegs, refusedJpegs } from "./jpegMarkers.js";
import {
  acceptedLosslessJpegs,
  type LosslessOutcome,
  losslessOutcome,
  refusedLosslessJpegs,
} from "./losslessJpegs.js";

const jpeg = dataUriBytes(gradientJpeg);

/** The size Chromium draws `bytes` at: 0x0 when it cannot decode them. */
async function drawnSize(bytes: Uint8Array): Promise<readonly [number, number]> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode().catch(() => undefined);
  return [image.naturalWidth, image.naturalHeight];
}

describe("Chromium and the sniffer agree on JPEG markers", () => {
  // Chromium draws nothing for these, including SOF5, C8, SOF13 and 16-bit samples patched onto baseline Huffman data
  // (genuine files of those kinds are not probed; the sniffer refuses them fail-closed). The genuine frame types follow
  // below. RSTn, TEM, DNL, DAC and short segments Chromium draws: the sniffer refuses them for resvg parity.
  const undrawable = refusedJpegs(jpeg).filter((row) => row.chromiumDrawsNothing);

  test.each(undrawable.map((row) => [row.name, row.bytes] as const))(
    "Chromium draws nothing for a JPEG with %s, which the sniffer refuses",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([0, 0]);
      expect(sniffImage(bytes, 1000).ok).toBe(false);
    },
  );

  const resvgOnly = refusedJpegs(jpeg).filter((row) => row.resvgDrawsNothing === true);

  test.each(resvgOnly.map((row) => [row.name, row.bytes] as const))(
    "Chromium draws a JPEG with %s, which resvg draws empty and the sniffer refuses",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([32, 16]);
      expect(await opaquePixels(bytes)).toBe(32 * 16);
      expect(sniffImage(bytes, 1000).ok).toBe(false);
    },
  );

  const grey = acceptedJpegs(jpeg).filter((row) => row.drawsGrey === true);

  test.each(grey.map((row) => [row.name, row.bytes] as const))(
    "Chromium draws the JPEG with %s flat grey, as resvg does",
    async (_name, bytes) => {
      expect(await opaquePixels(bytes)).toBe(32 * 16);
      expect(await pixelAt(bytes)).toEqual([128, 128, 128]);
    },
  );

  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "Chromium draws %s at 32x16, which the sniffer accepts at that size",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([32, 16]);
      expect(sniffImage(bytes, 1000)).toMatchObject({ ok: true, info: { width: 32, height: 16 } });
    },
  );
});

/** How many pixels Chromium draws opaque of `bytes`, through a canvas. */
async function opaquePixels(bytes: Uint8Array): Promise<number> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] === 255) opaque++;
  return opaque;
}

/** The colour Chromium draws at (5,0) of `bytes`, through a canvas. */
async function pixelAt(bytes: Uint8Array): Promise<readonly number[]> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  context.drawImage(image, 0, 0);
  return [...context.getImageData(5, 0, 1, 1).data.subarray(0, 3)];
}

/** What Chromium draws of the lossless JPEG `bytes`, the whole image through a canvas. */
async function losslessDrawing(bytes: Uint8Array): Promise<LosslessOutcome> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode().catch(() => undefined);
  if (image.naturalWidth === 0) return "nothing";
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return losslessOutcome(pixels);
}

describe("Chromium and the sniffer agree on lossless JPEGs", () => {
  test.each(acceptedLosslessJpegs.map((row) => [row.name, row.bytes] as const))(
    "Chromium draws the 8-bit RGB lossless JPEG with %s as its source, which the sniffer accepts",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([32, 16]);
      expect(await losslessDrawing(bytes)).toBe("equal");
      expect(sniffImage(bytes, 1000)).toMatchObject({ ok: true, info: { width: 32, height: 16 } });
    },
  );

  const probed = refusedLosslessJpegs().flatMap((row) =>
    row.chromium === undefined ? [] : [[row.name, row.bytes, row.chromium] as const],
  );

  test.each(probed)(
    "Chromium's drawing of the lossless JPEG with %s is pinned, and the sniffer refuses it",
    async (_name, bytes, outcome) => {
      expect(await losslessDrawing(bytes)).toEqual(outcome);
      expect(sniffImage(bytes, 1000).ok).toBe(false);
    },
  );
});

/** What Chromium draws of `bytes`, the whole image through a canvas, pinned at pixel `at`. */
async function chromiumDrawing(
  bytes: Uint8Array,
  at?: readonly [number, number],
): Promise<DrawnOutcome> {
  const image = new Image();
  image.src = toDataUri("image/jpeg", bytes);
  await image.decode().catch(() => undefined);
  if (image.naturalWidth === 0) return "nothing";
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  context.drawImage(image, 0, 0);
  return drawnOutcome(context.getImageData(0, 0, canvas.width, canvas.height).data, at);
}

describe("what Chromium draws of the JPEG structure cases", () => {
  const pinned = jpegStructureCases(jpeg).flatMap((row) =>
    row.chromium === undefined ? [] : [[row.name, row.bytes, row.chromium] as const],
  );

  test.each(pinned)("%s", async (_name, bytes, outcome) => {
    expect(await chromiumDrawing(bytes)).toEqual(outcome);
  });
});

describe("what Chromium draws of the JPEG entropy cases", () => {
  const pinned = jpegEntropyCases(jpeg).flatMap((row) =>
    row.chromium === undefined ? [] : [[row.name, row] as const],
  );

  test.each(pinned)("%s", async (_name, row) => {
    expect(await chromiumDrawing(row.bytes, row.at)).toEqual(row.chromium);
  });
});

describe("Chromium draws the genuine JPEG frame types the sniffer refuses", () => {
  test.each(jpegFrameFixtures.map((row) => [row.name, row] as const))(
    "%s is drawn at 32x16 and refused",
    async (_name, row) => {
      expect(await drawnSize(row.bytes)).toEqual([32, 16]);
      expect(sniffImage(row.bytes, 1000).ok).toBe(false);
      if (row.chromiumPixel !== undefined)
        expect(await pixelAt(row.bytes)).toEqual(row.chromiumPixel);
    },
  );
});

/** The result of sniffing the costly progressive JPEG and the steps it charged. */
function sniffCostly() {
  const budget = new EntropyBudget();
  const result = sniffImage(costlyProgressiveJpeg(), 1000, budget);
  return { result, steps: maxRenderEntropySteps - budget.remaining };
}

describe("the sniff cache in Chromium", () => {
  test("a hit gives the result and charges the steps the Node project measures", () => {
    sniffCache.clear();
    const cold = sniffCostly();
    const warm = sniffCostly();
    expect(sniffCache.stats).toMatchObject({ hits: 1, misses: 1, entries: 1 });
    expect(warm).toEqual(cold);
    expect(cold.steps).toBe(costlyProgressiveSteps);
  });

  test("a repeated render of a colour-tagged JPEG writes the SVG of an empty cache", () => {
    sniffCache.clear();
    const row = colourImages.find((image) => image.mime === "image/jpeg");
    const design = colourDesign(row?.uri ?? "");
    const cold = renderSvg(design);
    const misses = sniffCache.stats.misses;
    const warm = renderSvg(design);
    expect(sniffCache.stats.misses).toBe(misses);
    expect(warm).toEqual(cold);
  });
});
