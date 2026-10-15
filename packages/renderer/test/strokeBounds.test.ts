import { describe, expect, test } from "vitest";
import { strokeBounds } from "../src/strokeBounds.js";

/** The bound keeps a thousandth of a miter tip in hand for single precision rasterizers. */
const tip = (length: number) => length * 1.001;

function bounds(d: string, strokeWidth: number) {
  const box = strokeBounds(d, strokeWidth);
  if (box === undefined) throw new Error("no box");
  return box;
}

describe("strokeBounds", () => {
  test("a square's right-angle miters reach half the width per axis", () => {
    for (const d of ["M0 0 H40 V40 H0 Z", "M0 0 H40 V40 H0 V0 Z"]) {
      const box = bounds(d, 100);
      expect(box.minX).toBeCloseTo(-tip(50), 9);
      expect(box.minY).toBeCloseTo(-tip(50), 9);
      expect(box.maxX).toBeCloseTo(40 + tip(50), 9);
      expect(box.maxY).toBeCloseTo(40 + tip(50), 9);
    }
  });

  test("a spike past the miter limit is a bevel, within half the width", () => {
    expect(bounds("M0 0 L100 10 L0 20", 10)).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 25 });
  });

  test("a 60-degree corner reaches its miter tip", () => {
    const corner = { x: 100, y: 0 };
    const end = { x: 100 - 50, y: Math.sqrt(3) * 50 };
    const box = bounds(`M0 0 L${String(corner.x)} 0 L${String(end.x)} ${String(end.y)}`, 10);
    // Half the width over sin(30 degrees) along the outer bisector (cos 30, -sin 30).
    const reach = 5 / 0.5;
    const tipX = corner.x + reach * (Math.sqrt(3) / 2);
    const tipY = corner.y - reach * 0.5;
    expect(box.maxX).toBeGreaterThanOrEqual(tipX);
    expect(box.maxX).toBeLessThan(tipX + 0.05);
    expect(box.minY).toBeLessThanOrEqual(tipY);
    expect(box.minY).toBeGreaterThan(tipY - 0.05);
  });

  test("a curve's end direction comes from its last control point that differs from the end", () => {
    // The second control point is the end point: the direction comes from the first, (1, 0).
    const box = bounds("M0 0 C50 0 100 0 100 0 L100 100", 10);
    expect(box.maxX).toBeCloseTo(100 + tip(5), 9);
    expect(box.minY).toBeCloseTo(-tip(5), 9);
    const quadratic = bounds("M0 0 Q100 0 100 0 L100 100", 10);
    expect(quadratic.maxX).toBeCloseTo(100 + tip(5), 9);
  });

  test("a join at an arc takes twice the width at that vertex", () => {
    const box = bounds("M0 0 A50 50 0 0 1 100 0 L100 100", 10);
    expect(box.maxX).toBe(120);
    expect(box.minX).toBe(-5);
  });

  test("an open path has no join at its ends: butt caps stay within half the width", () => {
    expect(bounds("M0 0 L100 0", 10)).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 5 });
    expect(bounds("M0 0 L100 0 M0 50 L100 50", 10)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 105,
      maxY: 55,
    });
  });

  test("a zero-length segment makes its joins twice the width", () => {
    const box = bounds("M0 0 L100 0 L100 0 L100 100", 10);
    expect(box.maxX).toBe(120);
    expect(box.minY).toBe(-20);
  });

  test("a segment too short for a sure direction makes its joins twice the width", () => {
    const box = bounds("M0 0 L100 0 L100.001 0.001 L100 100", 10);
    expect(box.maxX).toBeCloseTo(120.001, 9);
  });

  test("no point, no box", () => {
    expect(strokeBounds("", 10)).toBeUndefined();
    expect(strokeBounds("not path data", 10)).toBeUndefined();
  });
});
