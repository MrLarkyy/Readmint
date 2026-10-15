import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, expect, test } from "vitest";
import { initRaster } from "../src/initRaster.js";
import { lossyJpegs, svgOf } from "./jpegDecoderTolerance.js";

beforeAll(async () => {
  await initRaster();
});

/** The resvg half of the Chromium comparison (jpegDecoderDifference.browser.test.ts): its pixels are what that test measures against. */
test.each(lossyJpegs.map((jpeg) => [jpeg.name, jpeg] as const))(
  "resvg draws %s opaque at the fixture's size",
  (_name, jpeg) => {
    const { width, height } = jpeg;
    const resvg = new Resvg(svgOf(jpeg));
    const image = resvg.render();
    const pixels = image.pixels;
    expect(pixels.length).toBe(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
    image.free();
    resvg.free();
  },
);
