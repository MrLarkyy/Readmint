import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { initRaster } from "../src/initRaster.js";
import { jpegFrameFixtures } from "../../renderer/test/jpegFrameTypes.js";
import { dataUri, designInput, imageDesign } from "./rasterFixtures.js";

beforeAll(async () => {
  await initRaster();
});

describe("the genuine JPEG frame types the renderer refuses", () => {
  test.each(jpegFrameFixtures.map((row) => [row.name, row.bytes] as const))(
    "exportRaster refuses %s as an asset format",
    async (_name, bytes) => {
      const input = designInput(imageDesign(dataUri("image/jpeg", bytes)));
      await expect(exportRaster(input, { format: "png", scale: 2 })).rejects.toThrow(
        /asset-format/,
      );
    },
  );
});

// sof3-12bit-rgb is never handed to resvg here: it traps ("unreachable") and poisons the wasm instance of the worker,
// which is why the renderer's refusal has to hold; its row above covers it.
describe("what resvg-wasm 2.6.2 draws of them, the reason for the refusal", () => {
  const direct = jpegFrameFixtures.flatMap((row) =>
    row.resvg === "traps" ? [] : ([[row.name, row.bytes, row.resvg]] as const),
  );

  test.each(direct)("%s", (_name, bytes, outcome) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><image width="32" height="16" href="${dataUri("image/jpeg", bytes)}"/></svg>`;
    const resvg = new Resvg(svg);
    const image = resvg.render();
    const pixels = image.pixels;
    image.free();
    resvg.free();
    let drawn = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) drawn++;
    if (outcome === "nothing") {
      expect(drawn).toBe(0);
    } else {
      expect([...pixels.subarray(5 * 4, 5 * 4 + 3)]).toEqual(outcome);
    }
  });
});
