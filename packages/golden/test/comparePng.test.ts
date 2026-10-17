import { PNG } from "pngjs";
import { describe, expect, test } from "vitest";
import { defaultNodeTolerance } from "../src/GoldenTolerance.js";
import { comparePng, maxPngSide } from "../src/node/comparePng.js";
import { pngSize, solidPng, withPixel, type Rgba } from "./pngFixtures.js";

const white: Rgba = [255, 255, 255, 255];
const black: Rgba = [0, 0, 0, 255];

function block(source: Buffer, from: number, size: number, rgba: Rgba): Buffer {
  const png = PNG.sync.read(source);
  for (let y = from; y < from + size; y++) {
    for (let x = from; x < from + size; x++) png.data.set(rgba, (y * png.width + x) * 4);
  }
  return PNG.sync.write(png);
}

describe("comparePng", () => {
  test("identical images pass", () => {
    const png = solidPng(8, 8, white);
    expect(comparePng(png, png, defaultNodeTolerance)).toMatchObject({
      pass: true,
      diffPixels: 0,
      totalPixels: 64,
    });
  });

  test("one pixel changed beyond the threshold fails with a diff image of the same size", () => {
    const golden = solidPng(8, 8, white);
    const result = comparePng(golden, withPixel(golden, 3, 3, black), defaultNodeTolerance);
    expect(result.pass).toBe(false);
    expect(result.diffPixels).toBe(1);
    expect(pngSize(result.diffPng ?? Buffer.alloc(0))).toEqual({ width: 8, height: 8 });
  });

  test("a change below the colour threshold passes", () => {
    const golden = solidPng(8, 8, white);
    expect(
      comparePng(golden, withPixel(golden, 3, 3, [250, 250, 250, 255]), defaultNodeTolerance).pass,
    ).toBe(true);
  });

  test("a share of differing pixels within maxDiffRatio passes", () => {
    const golden = solidPng(8, 8, white);
    const changed = withPixel(golden, 3, 3, black);
    expect(
      comparePng(golden, changed, { ...defaultNodeTolerance, maxDiffRatio: 0.02, maxTileInk: 1 })
        .pass,
    ).toBe(true);
    expect(comparePng(golden, changed, { ...defaultNodeTolerance, maxDiffRatio: 0.01 }).pass).toBe(
      false,
    );
  });

  test("a faint mark below the colour threshold fails the ink check", () => {
    const golden = solidPng(16, 16, white);
    const faint = block(golden, 1, 3, [235, 235, 235, 255]);
    const result = comparePng(golden, faint, defaultNodeTolerance);
    expect(result).toMatchObject({ pass: false, diffPixels: 0 });
    expect(result.reason).toContain("ink of the 16x16 tile at 0,0");
  });

  test("ink moved within a tile passes the ink check", () => {
    const golden = withPixel(solidPng(16, 16, white), 3, 3, [128, 128, 128, 255]);
    const moved = withPixel(solidPng(16, 16, white), 4, 3, [128, 128, 128, 255]);
    const result = comparePng(golden, moved, { ...defaultNodeTolerance, maxDiffRatio: 1 });
    expect(result).toMatchObject({ pass: true, inkShift: 0 });
  });

  test("a faint alpha-only mark on a transparent image fails", () => {
    const golden = solidPng(16, 16, [0, 0, 0, 0]);
    const marked = block(golden, 1, 3, [0, 0, 0, 20]);
    const result = comparePng(golden, marked, { ...defaultNodeTolerance, maxDiffRatio: 1 });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("ink");
  });

  test("maxTileInk 1 turns the ink check off", () => {
    const golden = solidPng(16, 16, white);
    const faint = block(golden, 1, 3, [235, 235, 235, 255]);
    expect(comparePng(golden, faint, { ...defaultNodeTolerance, maxTileInk: 1 }).pass).toBe(true);
  });

  test("a partial edge tile is normalised by its real pixel count", () => {
    const golden = solidPng(20, 20, white);
    const changed = block(golden, 17, 2, [235, 235, 235, 255]);
    const result = comparePng(golden, changed, defaultNodeTolerance);
    expect(result.inkShift).toBeCloseTo((4 * 20) / (16 * 255), 6);
    expect(result.reason).toContain("tile at 16,16");
  });

  test("a size mismatch fails with a reason", () => {
    const result = comparePng(solidPng(8, 8, white), solidPng(8, 9, white), defaultNodeTolerance);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("8x9");
    expect(result.reason).toContain("8x8");
  });

  test("an image above the size cap is rejected before decoding", () => {
    const huge = solidPng(8, 8, white);
    huge.writeUInt32BE(maxPngSide + 1, 16);
    const result = comparePng(solidPng(8, 8, white), huge, defaultNodeTolerance);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  test("bytes that are not a PNG are rejected", () => {
    const result = comparePng(
      solidPng(8, 8, white),
      Buffer.from("not a png at all, just text"),
      defaultNodeTolerance,
    );
    expect(result).toMatchObject({ pass: false, reason: "rendered image is not a PNG" });
  });
});
