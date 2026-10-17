import { describe, expect, test } from "vitest";
import { fitFrameRate } from "../src/fitFrameRate.js";
import { frameCount } from "../src/frameCount.js";
import { FrameBudget } from "../src/FrameBudget.js";
import { RasterLimits } from "../src/RasterLimits.js";

const ms = { ms: 1, min: 1 };
const cs = { ms: 10, min: 2 };

describe("fitFrameRate", () => {
  test("a 60 s loop under the frame limit gets 16 fps", () => {
    const minute = { duration: 60_000, loop: true };
    const fits = (frames: number): boolean => frames <= 1000;
    expect(fitFrameRate(minute, 30, ms, fits)).toBe(16);
    expect(frameCount(minute, 16, ms)).toBe(960);
    expect(frameCount(minute, 17, ms)).toBe(1020);
  });

  test("the held end frame of a timeline that does not loop counts", () => {
    const once = { duration: 1000, loop: false };
    expect(fitFrameRate(once, 30, ms, (frames) => frames <= 10)).toBe(9);
  });

  test("a pixel-bound case: 1680x800 pixels over 60 s allows 3 fps", () => {
    const minute = { duration: 60_000, loop: true };
    const fits = new FrameBudget(RasterLimits, 1680, 800, 0, 0);
    expect(fitFrameRate(minute, 30, ms, (frames) => fits.fits(frames))).toBe(3);
  });

  test("image work counts like frames", () => {
    const minute = { duration: 60_000, loop: true };
    const limits = { ...RasterLimits, maxImagePixels: 5_000_000 };
    const fits = new FrameBudget(limits, 10, 10, 1000, 10_000);
    expect(fitFrameRate(minute, 30, ms, (frames) => fits.fits(frames))).toBe(8);
  });

  test("GIF delay merging is counted, as the export counts it", () => {
    const gif = { duration: 1001, loop: true };
    expect(frameCount(gif, 50, cs)).toBe(50);
    expect(fitFrameRate(gif, 50, cs, (frames) => frames <= 50)).toBe(50);
    expect(fitFrameRate(gif, 50, ms, (frames) => frames <= 50)).toBe(49);
  });

  test("no rate fits: undefined", () => {
    expect(fitFrameRate({ duration: 500, loop: true }, 30, ms, () => false)).toBeUndefined();
  });

  test("a start that fits is returned as it is", () => {
    expect(fitFrameRate({ duration: 500, loop: true }, 5, ms, () => true)).toBe(5);
  });
});
