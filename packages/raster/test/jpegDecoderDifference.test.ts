import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, expect, test } from "vitest";
import { initRaster } from "../src/initRaster.js";
import { lossyJpegs } from "./jpegDecoderTolerance.js";

beforeAll(async () => {
  await initRaster();
});

/** The resvg half of the Chromium comparison (jpegDecoderDifference.browser.test.ts): its pixels are what that test measures against. */
test.each(lossyJpegs.map((jpeg) => [jpeg.name, jpeg] as const))(
  "resvg draws %s opaque at the fixture's size",
  (_name, jpeg) => {
    const binary = Buffer.from(jpeg.uri.slice(jpeg.uri.indexOf(",") + 1), "base64");
    const sof = binary.findIndex(
      (byte, at) => byte === 0xff && [0xc0, 0xc2].includes(binary[at + 1] ?? 0),
    );
    const height = binary.readUInt16BE(sof + 5);
    const width = binary.readUInt16BE(sof + 7);
    const resvg = new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><image width="${String(width)}" height="${String(height)}" href="${jpeg.uri}"/></svg>`,
    );
    const image = resvg.render();
    const pixels = image.pixels;
    expect(pixels.length).toBe(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
    image.free();
    resvg.free();
  },
);
