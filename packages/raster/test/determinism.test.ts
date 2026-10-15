import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { encodePng } from "../src/encodePng.js";
import { OutputBudget } from "../src/OutputBudget.js";
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

test("PNG bytes are fixed by the pixels alone: plain JavaScript compression, the same on every machine", () => {
  const pixels = Uint8Array.from(
    { length: 64 * 16 * 4 },
    (_, index) => (index * 7 + (index >> 6)) & 0xff,
  );
  const png = encodePng(pixels, 64, 16, new OutputBudget(1e9, "PNG"));
  expect(createHash("sha256").update(png).digest("hex")).toBe(
    "e7dc9b3cdc1753e1187ca0088b9712e61f7daa2b8cc0654088b8f23609849961",
  );
});
