import { describe, expect, test } from "vitest";
import { sniffImage } from "../src/sniffImage.js";
import gradientJpeg from "./assets/gradient.jpg?inline";
import { dataUriBytes, toDataUri } from "./exifImages.js";
import { jpegFrameFixtures } from "./jpegFrameTypes.js";
import { acceptedJpegs, refusedJpegs } from "./jpegMarkers.js";

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

  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "Chromium draws %s at 32x16, which the sniffer accepts at that size",
    async (_name, bytes) => {
      expect(await drawnSize(bytes)).toEqual([32, 16]);
      expect(sniffImage(bytes, 1000)).toMatchObject({ ok: true, info: { width: 32, height: 16 } });
    },
  );
});

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
