import { describe, expect, test } from "vitest";
import { pathLength } from "../src/pathLength.js";

/** The length of a curve by 100000 chords, far finer than the renderer's 32. */
function reference(point: (t: number) => readonly [number, number]): number {
  let length = 0;
  let [x0, y0] = point(0);
  for (let step = 1; step <= 100_000; step++) {
    const [x, y] = point(step / 100_000);
    length += Math.hypot(x - x0, y - y0);
    x0 = x;
    y0 = y;
  }
  return length;
}

describe("pathLength", () => {
  test.each([
    ["M0 0 L3 4", 5],
    ["M0 0 l3 4 l3 -4", 10],
    ["M0 0 H10 V10 h-10 z", 40],
    ["M0 0 L30 40 M100 100 L100 110", 60],
    ["M5 5", 0],
    ["", 0],
  ])("lines of %s are exact", (d, length) => {
    expect(pathLength(d)).toBe(length);
  });

  test("a cubic is within 0.5 % and never longer than the curve", () => {
    const exact = reference((t) => {
      const u = 1 - t;
      return [
        3 * u * u * t * 0 + 3 * u * t * t * 100 + t * t * t * 100,
        3 * u * u * t * 80 + 3 * u * t * t * -40 + t * t * t * 0,
      ];
    });
    const length = pathLength("M0 0 C0 80 100 -40 100 0");
    expect(Math.abs(length - exact) / exact).toBeLessThan(0.005);
    expect(length).toBeLessThanOrEqual(exact);
  });

  test("a smooth cubic and a quadratic chain follow their reflected control points", () => {
    const quadratic = reference((t) => {
      const u = 1 - t;
      return [2 * u * t * 50 + t * t * 100, 2 * u * t * 60];
    });
    expect(Math.abs(pathLength("M0 0 Q50 60 100 0") - quadratic) / quadratic).toBeLessThan(0.005);
    expect(pathLength("M0 0 Q50 60 100 0 T200 0")).toBeCloseTo(
      2 * pathLength("M0 0 Q50 60 100 0"),
      9,
    );
    expect(pathLength("M0 0 C0 50 50 50 50 0 S100 -50 100 0")).toBeCloseTo(
      2 * pathLength("M0 0 C0 50 50 50 50 0"),
      9,
    );
  });

  test("an arc in unvalidated data counts at least its length", () => {
    // A half circle of radius 10 is 31.4 long.
    expect(pathLength("M0 0 A10 10 0 0 1 20 0")).toBeGreaterThan(31.42);
    expect(pathLength("M0 0 A0 10 0 0 1 20 0")).toBe(20);
  });
});
