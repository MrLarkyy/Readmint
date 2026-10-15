import { describe, expect, test } from "vitest";
import { OutputBudget } from "../src/OutputBudget.js";
import { encodeWebp } from "../src/encodeWebp.js";
import { RasterError } from "../src/index.js";
import { rasterCodecs } from "../src/initRaster.js";
import { readWebp, riffWebp, writeU24le } from "../src/webpChunks.js";

const limits = { maxSide: 8192, maxFrames: 1000 };

async function animatedWebp(frames: number): Promise<Uint8Array> {
  const codecs = await rasterCodecs();
  const encoder = encodeWebp(8, 4, true, codecs, new OutputBudget(1e9, "WebP"));
  for (let frame = 0; frame < frames; frame++) {
    encoder.add(new Uint8Array(8 * 4 * 4).fill(frame * 40 + 10), 50);
  }
  return encoder.finish();
}

function rejects(bytes: Uint8Array, reason: string, readLimits = limits): void {
  expect(() => readWebp(bytes, readLimits)).toThrow(RasterError);
  expect(() => readWebp(bytes, readLimits)).toThrow(reason);
}

describe("readWebp", () => {
  test("reads the canvas, loop count and frames of an animated WebP", async () => {
    const image = readWebp(await animatedWebp(3), limits);
    expect(image).toMatchObject({ kind: "animated", width: 8, height: 4, loopCount: 0 });
    if (image.kind !== "animated") return;
    expect(image.frames.map((frame) => [frame.x, frame.y, frame.width, frame.height])).toEqual([
      [0, 0, 8, 4],
      [0, 0, 8, 4],
      [0, 0, 8, 4],
    ]);
    expect(image.frames.every((frame) => frame.duration === 50 && !frame.blend)).toBe(true);
  });

  test("every truncation is a raster-image error, never another failure", async () => {
    const bytes = await animatedWebp(2);
    for (let length = 0; length < bytes.length; length++) {
      const cut = bytes.slice(0, length);
      expect(() => readWebp(cut, limits), String(length)).toThrow(RasterError);
    }
  });

  test("a RIFF size past the end, or a chunk running past it, is refused", async () => {
    const bytes = await animatedWebp(1);
    const larger = bytes.slice();
    new DataView(larger.buffer).setUint32(4, bytes.length, true);
    rejects(larger, "RIFF size is larger than the file");
    const chunk = bytes.slice();
    new DataView(chunk.buffer).setUint32(16, 0x7fffffff, true);
    rejects(chunk, "runs past the end");
  });

  test("a frame outside the canvas, too many frames, a zero or too large size are refused", async () => {
    const bytes = await animatedWebp(3);
    rejects(bytes, "more than 2 frames", { maxSide: 8192, maxFrames: 2 });
    rejects(bytes, "each side may be at most 4", { maxSide: 4, maxFrames: 10 });
    const outside = bytes.slice();
    // The first ANMF payload starts after RIFF (12), VP8X (18), ANIM (14) and its own header (8).
    writeU24le(outside, 12 + 18 + 14 + 8, 1);
    rejects(outside, "outside the canvas");
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x02;
    writeU24le(vp8x, 4, 0xffffff);
    writeU24le(vp8x, 7, 0);
    rejects(riffWebp([{ type: "VP8X", data: vp8x }]), "each side may be at most 8192");
    rejects(
      riffWebp([{ type: "VP8 ", data: Uint8Array.of(0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 4, 0) }]),
      "zero size",
    );
  });

  test("anything not a RIFF WEBP file is refused", () => {
    rejects(new TextEncoder().encode("RIFF\x04\x00\x00\x00WAVE"), "not a RIFF WEBP file");
    rejects(new Uint8Array(0), "not a RIFF WEBP file");
    rejects(riffWebp([]), "holds no chunk");
    rejects(riffWebp([{ type: "ICCP", data: new Uint8Array(4) }]), "first chunk is unknown");
  });

  test("an animation without ANIM or without frames is refused", () => {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x02;
    rejects(riffWebp([{ type: "VP8X", data: vp8x }]), "no ANIM chunk");
    rejects(
      riffWebp([
        { type: "VP8X", data: vp8x },
        { type: "ANIM", data: new Uint8Array(6) },
      ]),
      "has no frame",
    );
  });
});
