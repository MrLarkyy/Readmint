import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { initRaster } from "../src/initRaster.js";
import { acceptedJpegs } from "../../renderer/test/jpegMarkers.js";
import { decodeApng } from "./decodeRaster.js";
import { dataUri, designInput, imageDesign } from "./rasterFixtures.js";

const jpeg = new Uint8Array(
  readFileSync(join(import.meta.dirname, "..", "..", "renderer", "test", "assets", "gradient.jpg")),
);
const background = [0xf6, 0xf8, 0xfa];

/** Pixels that differ from the canvas background: zero when resvg draws the image empty. */
async function drawnPixels(bytes: Uint8Array): Promise<number> {
  const output = await exportRaster(designInput(imageDesign(dataUri("image/jpeg", bytes))), {
    format: "png",
    scale: 2,
  });
  const pixels = decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
  let drawn = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (background.some((value, channel) => pixels[index + channel] !== value)) drawn++;
  }
  return drawn;
}

beforeAll(async () => {
  await initRaster();
});

describe("accepted JPEG variants in the raster output", () => {
  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "resvg draws %s, as the preview does",
    async (_name, bytes) => {
      expect(await drawnPixels(bytes)).toBeGreaterThan(0);
    },
  );
});
