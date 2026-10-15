import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-wasm";
import { beforeAll, describe, expect, test } from "vitest";
import { exportRaster } from "../src/index.js";
import { initRaster } from "../src/initRaster.js";
import { jpegEntropyCases } from "../../renderer/test/jpegEntropyCases.js";
import { acceptedJpegs, refusedJpegs } from "../../renderer/test/jpegMarkers.js";
import { drawnOutcome, jpegStructureCases } from "../../renderer/test/jpegStructureCases.js";
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

/** resvg-wasm draws `bytes` straight at 32x16: its RGBA pixels. */
function resvgPixels(bytes: Uint8Array): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><image width="32" height="16" href="${dataUri("image/jpeg", bytes)}"/></svg>`;
  const resvg = new Resvg(svg);
  const image = resvg.render();
  const pixels = image.pixels;
  image.free();
  resvg.free();
  return pixels;
}

describe("what resvg draws of the JPEG structure cases", () => {
  const cases = jpegStructureCases(jpeg);
  const pinned = cases.flatMap((row) =>
    row.resvg === undefined ? [] : [[row.name, row.bytes, row.resvg] as const],
  );

  test.each(pinned)("%s", (_name, bytes, outcome) => {
    expect(drawnOutcome(resvgPixels(bytes))).toEqual(outcome);
  });

  test.each(cases.map((row) => [row.name, row] as const))(
    "exportRaster follows the sniffer on %s",
    async (_name, row) => {
      const output = exportRaster(designInput(imageDesign(dataUri("image/jpeg", row.bytes))), {
        format: "png",
        scale: 2,
      });
      if (row.message === undefined) await expect(output).resolves.toMatchObject({ format: "png" });
      else await expect(output).rejects.toThrow(/asset-format/);
    },
  );
});

describe("what resvg draws of the JPEG entropy cases", () => {
  const cases = jpegEntropyCases(jpeg);
  const pinned = cases.flatMap((row) =>
    row.resvg === undefined ? [] : [[row.name, row] as const],
  );

  test.each(pinned)("%s", (_name, row) => {
    expect(drawnOutcome(resvgPixels(row.bytes), row.at)).toEqual(row.resvg);
  });

  test.each(cases.map((row) => [row.name, row] as const))(
    "exportRaster follows the sniffer on %s",
    async (_name, row) => {
      const output = exportRaster(designInput(imageDesign(dataUri("image/jpeg", row.bytes))), {
        format: "png",
        scale: 2,
      });
      if (row.message === undefined) await expect(output).resolves.toMatchObject({ format: "png" });
      else await expect(output).rejects.toThrow(/asset-format/);
    },
  );
});

describe("JPEG variants resvg draws empty", () => {
  const resvgOnly = refusedJpegs(jpeg).filter((row) => row.resvgDrawsNothing === true);

  test.each(resvgOnly.map((row) => [row.name, row.bytes] as const))(
    "resvg-wasm 2.6.2 draws nothing of a JPEG with %s, which exportRaster refuses",
    async (_name, bytes) => {
      const pixels = resvgPixels(bytes);
      expect(pixels.filter((_value, index) => index % 4 === 3 && pixels[index] !== 0)).toHaveLength(
        0,
      );
      const input = designInput(imageDesign(dataUri("image/jpeg", bytes)));
      await expect(exportRaster(input, { format: "png", scale: 2 })).rejects.toThrow(
        /asset-format/,
      );
    },
  );
});

describe("accepted JPEG variants in the raster output", () => {
  const grey = acceptedJpegs(jpeg).filter((row) => row.drawsGrey === true);

  test.each(grey.map((row) => [row.name, row.bytes] as const))(
    "resvg-wasm 2.6.2 draws the JPEG with %s flat grey, as Chromium does",
    (_name, bytes) => {
      const pixels = resvgPixels(bytes);
      expect(pixels).toHaveLength(32 * 16 * 4);
      expect(new Set(pixels.filter((_value, index) => index % 4 !== 3))).toEqual(new Set([128]));
      expect(new Set(pixels.filter((_value, index) => index % 4 === 3))).toEqual(new Set([255]));
    },
  );

  test.each(acceptedJpegs(jpeg).map((row) => [row.name, row.bytes] as const))(
    "resvg draws %s, as the preview does",
    async (_name, bytes) => {
      expect(await drawnPixels(bytes)).toBeGreaterThan(0);
    },
  );
});
