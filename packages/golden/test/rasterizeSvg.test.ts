import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { rasterizeSvg } from "../src/node/rasterizeSvg.js";
import { pngSize } from "./pngFixtures.js";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="10" height="10" fill="#f00"/></svg>';

describe("rasterizeSvg", () => {
  test("size is the intrinsic size times the scale", () => {
    expect(pngSize(rasterizeSvg(svg))).toEqual({ width: 20, height: 10 });
    expect(pngSize(rasterizeSvg(svg, 3))).toEqual({ width: 60, height: 30 });
  });

  test("a root without width and height is an error", () => {
    expect(() =>
      rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"/>'),
    ).toThrow(/width and height/);
  });

  test("the bytes are the same on every run", () => {
    expect(rasterizeSvg(svg).equals(rasterizeSvg(svg))).toBe(true);
  });
});

test("fonts given as bytes draw text without suite font files", () => {
  const font = new Uint8Array(
    readFileSync(
      join(import.meta.dirname, "..", "..", "renderer", "test", "fonts", "ReadmintTestSymbols.ttf"),
    ),
  );
  const text = (char: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text x="2" y="16" font-family="Readmint Test Symbols" font-size="16">${char}</text></svg>`;
  const star = rasterizeSvg(text("\u2605"), 1, [], [font]);
  expect(star.equals(rasterizeSvg(text(" "), 1, [], [font]))).toBe(false);
  expect(star.equals(rasterizeSvg(text("\u2605"), 1, [], [font]))).toBe(true);
});
