import { beforeAll, expect, test } from "vitest";
import { colourDesign, colourImages, swatchDeviation } from "../../renderer/test/colourImages.js";
import { exportRaster } from "../src/index.js";
import { initRaster } from "../src/initRaster.js";
import { decodeApng } from "./decodeRaster.js";
import { designInput } from "./rasterFixtures.js";

beforeAll(async () => {
  await initRaster();
});

/** The resvg half of renderer colourImages.browser.test.ts: both draw every rendered fixture at the same colours. */
test.each(colourImages.map((row) => [row.name, row] as const))(
  "resvg draws the rendered %s at its stored colours",
  async (_name, row) => {
    const output = await exportRaster(designInput(colourDesign(row.uri)), {
      format: "png",
      scale: 1,
    });
    const pixels = decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
    expect(pixels.length).toBe(32 * 16 * 4);
    expect(swatchDeviation(pixels)).toBeLessThanOrEqual(row.tolerance);
  },
);
