import { frameTimes } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { frameDelays } from "../src/frameDelays.js";
import { exportRaster, type RasterFormat } from "../src/index.js";
import { decodeApng, decodeGif, type DecodedRaster, decodeWebp } from "./decodeRaster.js";
import { designInput, loopDesign, onceDesign } from "./rasterFixtures.js";

const animated: readonly RasterFormat[] = ["apng", "webp", "gif"];

async function decode(format: RasterFormat, bytes: Uint8Array): Promise<DecodedRaster> {
  if (format === "webp") return decodeWebp(bytes);
  if (format === "gif") return decodeGif(bytes);
  return decodeApng(bytes);
}

/** The delay unit of a format, in ms. */
function unit(format: RasterFormat): number {
  return format === "gif" ? 10 : 1;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sameAsNext(raster: DecodedRaster): boolean[] {
  return raster.frames
    .slice(1)
    .map((frame, index) =>
      Buffer.from(frame.pixels).equals(raster.frames[index]?.pixels ?? new Uint8Array()),
    );
}

describe("frameDelays", () => {
  test("rounds cumulatively, so delays add up to the duration at any frame rate", () => {
    for (const frameRate of [7, 24, 25, 30, 60]) {
      const animation = { duration: 1000, loop: true };
      const ms = frameDelays(frameTimes(animation, frameRate), animation, frameRate, {
        ms: 1,
        min: 1,
      });
      expect(sum(ms.map((frame) => frame.delay)), `${String(frameRate)} fps ms`).toBe(1000);
      const cs = frameDelays(frameTimes(animation, frameRate), animation, frameRate, {
        ms: 10,
        min: 2,
      });
      expect(sum(cs.map((frame) => frame.delay)), `${String(frameRate)} fps cs`).toBe(100);
      const delays = ms.map((frame) => frame.delay);
      expect(Math.max(...delays) - Math.min(...delays)).toBeLessThanOrEqual(1);
    }
  });

  test("a frame shorter than the shortest delay merges into the one before it", () => {
    const animation = { duration: 1001, loop: true };
    const frames = frameDelays(frameTimes(animation, 50), animation, 50, { ms: 10, min: 2 });
    expect(frames).toHaveLength(50);
    expect(frames.at(-1)).toEqual({ time: 980, delay: 2 });
    expect(sum(frames.map((frame) => frame.delay))).toBe(100);
    expect(frames.every((frame) => frame.delay >= 2)).toBe(true);
  });

  test("the held end frame of a timeline that plays once shows one frame interval", () => {
    const animation = { duration: 300, loop: false };
    const frames = frameDelays(frameTimes(animation, 10), animation, 10, { ms: 1, min: 1 });
    expect(frames).toEqual([
      { time: 0, delay: 100 },
      { time: 100, delay: 100 },
      { time: 200, delay: 100 },
      { time: 300, delay: 100 },
    ]);
  });
});

describe.each(animated)("%s timing", (format) => {
  test.each([7, 25, 30])(
    "a looping timeline at %i fps loops forever and lasts its duration",
    async (frameRate) => {
      const output = await exportRaster(designInput(loopDesign), { format, frameRate, scale: 1 });
      const raster = await decode(format, output.bytes);
      expect(raster.loop).toBe(0);
      expect(sum(raster.frames.map((frame) => frame.delay)) * unit(format)).toBe(500);
      expect(output.frames).toBe(raster.frames.length);
      expect(output.duration).toBe(500);
      expect(sameAsNext(raster)).not.toContain(true);
    },
  );

  test("a timeline that plays once plays once, ends on its end frame and merges identical frames", async () => {
    const output = await exportRaster(designInput(onceDesign), { format, frameRate: 10, scale: 1 });
    const raster = await decode(format, output.bytes);
    expect(raster.loop).toBe(format === "gif" ? null : 1);
    // 0, 100, 200 (the end of the move) ... 400 (held): 200..400 and the held frame are one frame.
    expect(raster.frames.map((frame) => frame.delay * unit(format))).toEqual([100, 100, 300]);
    const end = await exportRaster(designInput(onceDesign), { format: "png", time: 400, scale: 1 });
    const last = raster.frames.at(-1)?.pixels ?? new Uint8Array();
    // GIF draws its own palette of the same pixels, so only the lossless formats equal the PNG exactly.
    if (format !== "gif") {
      expect(Buffer.from(decodeApng(end.bytes).frames[0]?.pixels ?? []).equals(last)).toBe(true);
    }
  });
});

test("a GIF frame rate above 50 is refused: centisecond delays below 2 are stretched by players", async () => {
  const failure = exportRaster(designInput(loopDesign), { format: "gif", frameRate: 60 });
  await expect(failure).rejects.toMatchObject({ code: "raster-options" });
  await expect(failure).rejects.toThrow("1..50");
});
