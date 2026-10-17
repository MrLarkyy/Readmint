import { describe, expect, test } from "vitest";
import {
  exportRaster,
  RasterError,
  type RasterInput,
  RasterLimits,
  type RasterOptions,
} from "../src/index.js";
import { designInput, loopDesign, shapesDesign } from "./rasterFixtures.js";

/** The slide of `loopDesign` over 3000 ms: 1 fps samples three frames. */
const slowLoop = { ...loopDesign, animation: { duration: 3000 } };

interface Counted {
  readonly input: RasterInput;
  readonly frames: () => number;
}

function counted(design: typeof shapesDesign): Counted {
  let frames = 0;
  return {
    input: designInput(design, () => {
      frames++;
    }),
    frames: () => frames,
  };
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

describe("raster limits", () => {
  test("defaults", () => {
    expect(RasterLimits).toEqual({
      maxSide: 4096,
      maxFrames: 1000,
      maxDuration: 60_000,
      maxTotalPixels: 268_435_456,
      maxOutputBytes: 5_242_880,
      maxImagePixels: 268_435_456,
    });
    expect(Object.isFrozen(RasterLimits)).toBe(true);
  });

  test("a side over the limit fails before any frame is drawn, naming size, limit and the scale", async () => {
    const { input, frames } = counted(shapesDesign);
    const error = await failure(input, { format: "png", scale: 2, limits: { maxSide: 100 } });
    expect(error.code).toBe("raster-too-large");
    expect(error.message).toContain("128x64");
    expect(error.message).toContain("at most 100");
    expect(error.message).toContain("lower the scale (for example to 1)");
    expect(error.message).not.toContain("--");
    expect(frames()).toBe(1);
  });

  test("too many frames fail before drawing, naming the count, the limit and the frame rate", async () => {
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, {
      format: "apng",
      frameRate: 30,
      limits: { maxFrames: 10 },
    });
    expect(error.code).toBe("raster-too-many-frames");
    expect(error.message).toContain("15 frames at 30 fps");
    expect(error.message).toContain("the 10 allowed");
    expect(error.message).toContain("lower the frame rate to 20 or less");
    expect(error.message).not.toContain("--");
    expect(frames()).toBe(1);
  });

  test("the default rate is lowered to fit the frame limit and reported", async () => {
    const { input } = counted(loopDesign);
    const output = await exportRaster(input, { format: "apng", limits: { maxFrames: 10 } });
    expect(output.frameRate).toBe(20);
    expect(output.frameRateFitted).toBe(true);
    expect(output.frames).toBe(10);
    const same = await exportRaster(input, {
      format: "apng",
      frameRate: 20,
      limits: { maxFrames: 10 },
    });
    expect(Buffer.from(output.bytes).equals(Buffer.from(same.bytes))).toBe(true);
  });

  test("when no rate that animates fits, the error is the plain one at the lowest such rate, never a still", async () => {
    // 1 and 2 fps sample one frame of the 500 ms loop, which would fit; 3 fps is the lowest rate with two.
    const { input } = counted(loopDesign);
    const error = await failure(input, { format: "apng", limits: { maxFrames: 1 } });
    expect(error.code).toBe("raster-too-many-frames");
    expect(error.message).toContain("2 frames at 3 fps, more than the 1 allowed");
    expect(error.message).toMatch(/allowed; shorten the animation$/);
    expect(error.message).not.toContain("lower the frame rate");
  });

  test("a pixel limit that no rate that animates fits names the scale only", async () => {
    const error = await failure(designInput(loopDesign), {
      format: "gif",
      scale: 1,
      limits: { maxTotalPixels: 2000 },
    });
    expect(error.code).toBe("raster-too-many-pixels");
    expect(error.message).toContain("(2 frames of 48x24)");
    expect(error.message).toMatch(/allowed; lower the scale$/);
  });

  test("a timeline over the limit fails before anything is rendered", async () => {
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, { format: "webp", limits: { maxDuration: 400 } });
    expect(error.code).toBe("raster-too-long");
    expect(error.message).toContain("500 ms");
    expect(error.message).toContain("the 400 ms allowed");
    expect(frames()).toBe(0);
  });

  test("too many pixels in total fail before drawing, naming frames and size", async () => {
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, {
      format: "gif",
      frameRate: 10,
      scale: 1,
      limits: { maxTotalPixels: 5000 },
    });
    expect(error.code).toBe("raster-too-many-pixels");
    expect(error.message).toContain("5760 pixels (5 frames of 48x24)");
    expect(error.message).toContain("the 5000 allowed");
    expect(error.message).toContain("lower the frame rate to 8 or less, or the scale");
    expect(error.message).not.toContain("--");
    expect(frames()).toBe(1);
  });

  test("the default rate is lowered to fit the pixel limit", async () => {
    const { input } = counted(loopDesign);
    const output = await exportRaster(input, {
      format: "gif",
      scale: 1,
      limits: { maxTotalPixels: 5000 },
    });
    expect(output.frameRate).toBe(8);
    expect(output.frameRateFitted).toBe(true);
    expect(output.frames).toBe(4);
  });

  test.each(["png", "webp", "gif"] as const)(
    "a %s output over the byte limit fails with no output",
    async (format) => {
      const error = await failure(designInput(shapesDesign), {
        format,
        limits: { maxOutputBytes: 200 },
      });
      expect(error.code).toBe("raster-output-too-large");
      expect(error.message).toMatch(/reached \d+ bytes, more than the 200 allowed/);
    },
  );

  test("a webp output over the byte limit suggests a quality; a quality or another format does not", async () => {
    const webp = await failure(designInput(shapesDesign), {
      format: "webp",
      limits: { maxOutputBytes: 200 },
    });
    expect(webp.message).toContain("give a WebP quality (1..100)");
    const lossy = await failure(designInput(shapesDesign), {
      format: "webp",
      quality: 75,
      limits: { maxOutputBytes: 100 },
    });
    expect(lossy.code).toBe("raster-output-too-large");
    expect(lossy.message).not.toContain("quality");
    const png = await failure(designInput(shapesDesign), {
      format: "png",
      limits: { maxOutputBytes: 200 },
    });
    expect(png.message).not.toContain("quality");
  });

  test("an animation over the byte limit stops at the frame that overflows it", async () => {
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, {
      format: "apng",
      frameRate: 10,
      limits: { maxOutputBytes: 300 },
    });
    expect(error.code).toBe("raster-output-too-large");
    expect(frames()).toBeLessThan(5);
  });

  test("an animation over the byte limit names a frame rate that fits", async () => {
    const options = { format: "apng", scale: 1 } as const;
    const full = await exportRaster(designInput(loopDesign), { ...options, frameRate: 20 });
    const limit = Math.floor(full.bytes.length * 0.5);
    const error = await failure(designInput(loopDesign), {
      ...options,
      frameRate: 20,
      limits: { maxOutputBytes: limit },
    });
    expect(error.code).toBe("raster-output-too-large");
    const named = Number(/about (\d+) fps fits at this size/.exec(error.message)?.[1]);
    // 3 fps is the lowest rate that animates the 500 ms loop.
    expect(named).toBeGreaterThanOrEqual(3);
    expect(named).toBeLessThan(20);
    expect(error.message).not.toContain("--");
    const fitted = await exportRaster(designInput(loopDesign), {
      ...options,
      frameRate: named,
      limits: { maxOutputBytes: limit },
    });
    expect(fitted.bytes.length).toBeLessThanOrEqual(limit);
  });

  test("a default rate over the byte limit is retried at a lower rate until the file fits", async () => {
    const options = { format: "apng", scale: 1 } as const;
    const full = await exportRaster(designInput(loopDesign), options);
    expect(full.frameRate).toBe(30);
    const limits = { maxOutputBytes: Math.floor(full.bytes.length * 0.5) };
    const { input, frames } = counted(loopDesign);
    const output = await exportRaster(input, { ...options, limits });
    expect(output.frameRateFitted).toBe(true);
    expect(output.frameRate).toBeLessThan(30);
    expect(output.bytes.length).toBeLessThanOrEqual(limits.maxOutputBytes);
    expect(frames()).toBeGreaterThan(output.frames);
    const explicit = await exportRaster(designInput(loopDesign), {
      ...options,
      frameRate: output.frameRate,
      limits,
    });
    expect(explicit.frameRateFitted).toBe(false);
    expect(Buffer.from(output.bytes).equals(Buffer.from(explicit.bytes))).toBe(true);
    const again = await exportRaster(designInput(loopDesign), { ...options, limits });
    expect(Buffer.from(again.bytes).equals(Buffer.from(output.bytes))).toBe(true);
  });

  test("an explicit rate over the byte limit is not retried", async () => {
    const options = { format: "apng", scale: 1 } as const;
    const full = await exportRaster(designInput(loopDesign), options);
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, {
      ...options,
      frameRate: 30,
      limits: { maxOutputBytes: Math.floor(full.bytes.length * 0.5) },
    });
    expect(error.code).toBe("raster-output-too-large");
    expect(frames()).toBeLessThan(30);
  });

  test("a default rate that does not fit even at 1 fps fails saying 1 fps was tried, naming the scale", async () => {
    const options = { format: "apng", scale: 1 } as const;
    const still = await exportRaster(designInput(slowLoop), { ...options, time: 0 });
    const slowest = await exportRaster(designInput(slowLoop), { ...options, frameRate: 1 });
    expect(slowest.frames).toBe(3);
    const limits = { maxOutputBytes: slowest.bytes.length - 1 };
    // The first frame fits, so the retries run down to 1 fps.
    expect(still.bytes.length).toBeLessThan(limits.maxOutputBytes);
    const error = await failure(designInput(slowLoop), { ...options, limits });
    expect(error.code).toBe("raster-output-too-large");
    expect(error.message).toMatch(
      /allowed even at 1 fps, the lowest frame rate that still animates; lower the scale, or export SVG$/,
    );
    expect(error.message).not.toContain("lower the scale or the frame rate");
    expect(error.message).not.toContain("fps fits");
  });

  test("an animation over the byte limit at its lowest animated rate stays an error, never a still image", async () => {
    const options = { format: "apng", scale: 1 } as const;
    const still = await exportRaster(designInput(loopDesign), { ...options, time: 0 });
    const slowest = await exportRaster(designInput(loopDesign), { ...options, frameRate: 3 });
    expect(slowest.format).toBe("apng");
    expect(slowest.frames).toBe(2);
    const limits = { maxOutputBytes: slowest.bytes.length - 1 };
    // 1 and 2 fps sample one frame, a still image that would fit.
    expect(still.bytes.length).toBeLessThan(limits.maxOutputBytes);
    const error = await failure(designInput(loopDesign), { ...options, limits });
    expect(error.code).toBe("raster-output-too-large");
    expect(error.message).toContain(
      "allowed even at 3 fps, the lowest frame rate that still animates",
    );
    const explicit = await failure(designInput(loopDesign), {
      ...options,
      frameRate: 20,
      limits,
    });
    expect(explicit.code).toBe("raster-output-too-large");
    expect(explicit.message).not.toMatch(/about [12] fps/);
    for (const frameRate of [1, 2]) {
      const one = await exportRaster(designInput(loopDesign), { ...options, frameRate });
      expect(one.frames).toBe(1);
    }
  });

  test("a still image over the byte limit names no frame rate", async () => {
    const error = await failure(designInput(shapesDesign), {
      format: "png",
      limits: { maxOutputBytes: 200 },
    });
    expect(error.message).not.toContain("fps");
    expect(error.message).not.toContain("frame rate");
    expect(error.message).toMatch(/allowed; lower the scale, or export SVG$/);
  });

  test.each([
    [{ format: "png", scale: 0.5 }, "scale must be in 1..4"],
    [{ format: "png", scale: 5 }, "scale must be in 1..4"],
    [{ format: "png", scale: Number.NaN }, "scale must be in 1..4"],
    [{ format: "apng", frameRate: 0 }, "1..60"],
    [{ format: "webp", frameRate: 61 }, "1..60"],
    [{ format: "webp", frameRate: 2.5 }, "whole number"],
    [{ format: "gif", frameRate: 51 }, "1..50"],
    [{ format: "png", time: -1 }, "time must be in 0..86400000"],
    [{ format: "webp", quality: 0 }, "quality must be a whole number in 1..100"],
    [{ format: "png", quality: 50 }, "quality applies to webp only"],
    [{ format: "jpeg" }, "format must be one of png, webp, apng, gif"],
  ] as [RasterOptions, string][])("%o is a raster-options error", async (options, message) => {
    const { input, frames } = counted(loopDesign);
    const error = await failure(input, options);
    expect(error.code).toBe("raster-options");
    expect(error.message).toContain(message);
    expect(frames()).toBe(0);
  });
});
