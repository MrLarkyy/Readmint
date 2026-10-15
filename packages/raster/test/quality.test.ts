import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { exportRaster, RasterError, type RasterOptions } from "../src/index.js";
import { webpChunks } from "../src/readWebp.js";
import { decodeWebp } from "./decodeRaster.js";
import { designInput, loopDesign, photoDesign, shapesDesign } from "./rasterFixtures.js";

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function webp(
  design: typeof loopDesign,
  options: Partial<RasterOptions> = {},
): Promise<Uint8Array> {
  return (await exportRaster(designInput(design), { format: "webp", ...options })).bytes;
}

/** The chunk types inside an ANMF payload: after its 16 header bytes, chunks of FourCC, LE size, data, padding. */
function frameChunkTypes(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.length);
  const types: string[] = [];
  for (
    let at = 16;
    at + 8 <= data.length;
    at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) & 1)
  ) {
    types.push(String.fromCharCode(...data.subarray(at, at + 4)));
  }
  return types;
}

/** The image chunk types of every frame (animated) or of the file (still). */
function imageChunks(bytes: Uint8Array): string[] {
  const top = webpChunks(bytes);
  const frames = top.filter((chunk) => chunk.type === "ANMF");
  if (frames.length === 0) return top.map((chunk) => chunk.type);
  return frames.flatMap((frame) => frameChunkTypes(frame.data));
}

describe("lossless default", () => {
  test("is byte-identical to the output before quality existed", async () => {
    expect(sha(await webp(shapesDesign))).toBe(
      "2d64686e065bcdf5c470c793c5d0aa844ecd8bd624e81202f45c7b35b04cb5db",
    );
    const loop = await webp(loopDesign);
    expect(sha(loop)).toBe("7413890b5c69ee5a23c95c066f36dedced2aeeb68acae40c391d86222a8d6d37");
  });
});

describe("lossy webp", () => {
  test("an animation has lossy frames of the same size and count", async () => {
    const lossy = await webp(loopDesign, { quality: 75 });
    const lossless = await webp(loopDesign);
    const types = imageChunks(lossy);
    expect(types).toContain("VP8 ");
    expect(types).not.toContain("VP8L");
    expect(imageChunks(lossless)).not.toContain("VP8 ");
    const a = await decodeWebp(lossy);
    const b = await decodeWebp(lossless);
    expect([a.width, a.height, a.frames.length]).toEqual([b.width, b.height, b.frames.length]);
    let error = 0;
    let count = 0;
    a.frames.forEach((frame, index) => {
      const other = b.frames[index]?.pixels;
      if (other === undefined) throw new Error("frame missing");
      for (let at = 0; at < frame.pixels.length; at += 4) {
        expect(frame.pixels[at + 3]).toBe(other[at + 3]);
        // The colour under fully transparent pixels is not part of the image.
        if (other[at + 3] === 0) continue;
        for (let channel = 0; channel < 3; channel++) {
          error += Math.abs((frame.pixels[at + channel] ?? 0) - (other[at + channel] ?? 0));
          count++;
        }
      }
    });
    expect(error / count).toBeLessThanOrEqual(8);
  });

  test("a still design and a time still are lossy too", async () => {
    expect(imageChunks(await webp(shapesDesign, { quality: 75 }))).toContain("VP8 ");
    const timed = await webp(loopDesign, { quality: 75, time: 200 });
    expect(imageChunks(timed)).toContain("VP8 ");
    expect(imageChunks(timed)).not.toContain("VP8L");
  });

  test("the same quality gives the same bytes, another quality other bytes", async () => {
    const one = await webp(loopDesign, { quality: 60 });
    expect(sha(await webp(loopDesign, { quality: 60 }))).toBe(sha(one));
    expect(sha(await webp(shapesDesign, { quality: 60 }))).toBe(
      sha(await webp(shapesDesign, { quality: 60 })),
    );
    expect(sha(await webp(loopDesign, { quality: 90 }))).not.toBe(sha(one));
  });

  test("quality 75 of the loop fixture is pinned: libwebp or the wasm build changed when this moves", async () => {
    expect(sha(await webp(loopDesign, { quality: 75 }))).toBe(
      "932f93ab354c8f489ad01c4f7c9bacd35542e4c73b081aa9984b2cbd44d7f1de",
    );
  });

  test.each([1, 100])("quality %i exports", async (quality) => {
    expect((await webp(loopDesign, { quality })).length).toBeGreaterThan(0);
  });

  test("a photo-heavy animation is smaller than its lossless WebP", async () => {
    const lossless = await webp(photoDesign);
    const lossy = await webp(photoDesign, { quality: 75 });
    expect(lossy.length).toBeLessThan(lossless.length);
  });
});

describe("quality options", () => {
  test.each([0, 101, 50.5, Number.NaN, -3])("%s is refused naming the range", async (quality) => {
    const error = await exportRaster(designInput(loopDesign), { format: "webp", quality }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RasterError);
    expect((error as RasterError).code).toBe("raster-options");
    expect((error as RasterError).message).toContain("1..100");
  });

  test.each(["png", "apng", "gif"] as const)("%s refuses a quality", async (format) => {
    const error = await exportRaster(designInput(loopDesign), { format, quality: 80 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RasterError);
    expect((error as RasterError).code).toBe("raster-options");
    expect((error as RasterError).message).toContain("webp only");
  });
});
