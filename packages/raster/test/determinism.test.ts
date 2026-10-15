import { expect, test } from "vitest";
import { exportRaster, type RasterFormat } from "../src/index.js";
import { designInput, loopDesign, textDesign } from "./rasterFixtures.js";

test.each(["png", "webp", "apng", "gif"] as RasterFormat[])(
  "two %s exports of the same input are the same bytes",
  async (format) => {
    for (const design of [textDesign, loopDesign]) {
      const first = await exportRaster(designInput(design), { format });
      const second = await exportRaster(designInput(design), { format });
      expect(Buffer.from(second.bytes).equals(first.bytes)).toBe(true);
    }
  },
);
