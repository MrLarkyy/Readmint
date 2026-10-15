import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { countImagePixels } from "../src/countImagePixels.js";
import { exportRaster, RasterError, type RasterInput, type RasterOptions } from "../src/index.js";
import { openWebpCodec } from "../src/initRaster.js";
import { webpChunks } from "../src/readWebp.js";
import { riffWebp, writeU24le } from "../src/writeWebp.js";
import { dataUri, designInput, patternPng } from "./rasterFixtures.js";

/** A PNG header declaring a size, with no pixels: enough for the budget, never decoded. */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(8 + 25 + 12 + 12);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13);
  out.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out.set([8, 6], 24);
  view.setUint32(33, 0);
  out.set([0x49, 0x44, 0x41, 0x54], 37);
  view.setUint32(45, 0);
  out.set([0x49, 0x45, 0x4e, 0x44], 49);
  return out;
}

/** An animated WebP declaring an 8192 x 8192 canvas around one 1 x 1 frame: tiny, but a huge canvas to decode. */
async function canvasBomb(duration: number): Promise<Uint8Array> {
  const codec = await openWebpCodec();
  const frame = webpChunks(
    codec.encodeWebp({ data: new Uint8Array([0, 0, 255, 255]), width: 1, height: 1 }),
  ).find((chunk) => chunk.type === "VP8L");
  if (frame === undefined) throw new Error("libwebp wrote no VP8L chunk");
  const header = new Uint8Array(10);
  header[0] = 0x02;
  writeU24le(header, 4, 8191);
  writeU24le(header, 7, 8191);
  const anmf = new Uint8Array(16 + 8 + frame.data.length + (frame.data.length & 1));
  writeU24le(anmf, 12, duration);
  anmf[15] = 0x02;
  anmf.set(riffWebp([frame]).subarray(12), 16);
  return riffWebp([
    { type: "VP8X", data: header },
    { type: "ANIM", data: new Uint8Array(6) },
    { type: "ANMF", data: anmf },
  ]);
}

async function failure(input: RasterInput, options: RasterOptions): Promise<RasterError> {
  try {
    await exportRaster(input, options);
  } catch (error) {
    if (error instanceof RasterError) return error;
    throw error;
  }
  throw new Error("the export did not fail");
}

describe("image decoding budget", () => {
  test("a 4096 x 4096 image shared by 1000 uses is refused before anything is drawn", async () => {
    const uses = '<use href="#s" width="8" height="8"/>'.repeat(1000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><image id="i" width="4096" height="4096" href="${dataUri("image/png", pngHeader(4096, 4096))}"/><symbol id="s" viewBox="0 0 4096 4096"><use href="#i"/></symbol></defs>${uses}</svg>`;
    let frames = 0;
    const started = performance.now();
    const error = await failure(
      {
        frame: () => {
          frames++;
          return svg;
        },
      },
      { format: "png" },
    );
    expect(error.code).toBe("raster-too-many-image-pixels");
    expect(error.message).toContain(
      "would decode 16777216000 pixels (1 images drawn 1000 times a frame, 1 frames), more than the 268435456 allowed",
    );
    expect(frames).toBe(1);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("tiny WebP images declaring huge canvases are refused before any is decoded", async () => {
    const images = await Promise.all([100, 200, 300].map(canvasBomb));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${images
      .map((bytes) => `<image width="8" height="8" href="${dataUri("image/webp", bytes)}"/>`)
      .join("")}</svg>`;
    const started = performance.now();
    const error = await failure({ frame: () => svg }, { format: "png" });
    expect(error.code).toBe("raster-too-many-image-pixels");
    expect(error.message).toContain(
      "would decode 402653184 pixels (3 images drawn 3 times a frame",
    );
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("counts what the renderer writes: one shared image drawn per layer, per frame", async () => {
    const design: Design = {
      version: 0,
      canvas: { width: 64, height: 24 },
      assets: { images: { picture: { src: dataUri("image/png", patternPng) } } },
      animation: { duration: 200 },
      layers: [0, 20, 40].map((x) => ({
        type: "image" as const,
        asset: "picture",
        x,
        y: 4,
        width: 24,
        height: 16,
      })),
    };
    const svg = designInput(design).frame(0);
    expect(countImagePixels(svg, 2)).toEqual({ pixels: 24 * 16 * 3 * 2, images: 1, draws: 3 });
    const options: RasterOptions = { format: "apng", frameRate: 10, scale: 1 };
    const refused = await failure(designInput(design), {
      ...options,
      limits: { maxImagePixels: 24 * 16 * 3 * 2 - 1 },
    });
    expect(refused.message).toContain("(1 images drawn 3 times a frame, 2 frames)");
    await expect(
      exportRaster(designInput(design), {
        ...options,
        limits: { maxImagePixels: 24 * 16 * 3 * 2 },
      }),
    ).resolves.toMatchObject({ format: "apng", duration: 200 });
  });

  test("an inline image counts once per frame and a WebP once more for its swap to PNG", () => {
    const png = `<image width="4" height="4" href="${dataUri("image/png", pngHeader(10, 10))}"/>`;
    expect(countImagePixels(`<svg>${png}${png}</svg>`, 3)).toEqual({
      pixels: 600,
      images: 2,
      draws: 2,
    });
  });
});
