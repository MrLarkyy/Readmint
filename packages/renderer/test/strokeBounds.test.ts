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
    // The second control point is the end point: the direction comes from the first, straight down (0, 1), and the
    // line goes on down: the join reaches half the width sideways only.
    const box = bounds("M0 0 C100 -100 100 0 100 0 L100 100", 10);
    expect(box.maxX).toBeCloseTo(100 + tip(5), 9);
    expect(box.maxY).toBe(105);
  });

  test("a nearly straight curve, drawn as lines by rasterizers, takes twice the width at its joins", () => {
    expect(bounds("M0 0 C50 0 100 0 100 0 L100 100", 10).maxX).toBe(120);
    expect(bounds("M0 0 Q100 0.5 200 0 L200 100", 10).maxX).toBe(220);
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

  test("a short segment a group scales below the rasterizer's tolerance never moves a miter tip out", () => {
    // Scaled down 250 times the stroke is still 4 device pixels wide, so it has joins, and the 0.05 long segment is
    // under 1/4096 device pixels: Skia skips it and joins (1, 0) with the direction from (0, 0) to the last point.
    const d = "M-3000 0 L0 0 L0 0.05 L-2610 1470";
    const box = bounds(d, 1000);
    for (const [x, y] of reach(
      skipped(
        [
          [-3000, 0],
          [0, 0],
          [0, 0.05],
          [-2610, 1470],
        ],
        250 / 4096,
      ),
      500,
    )) {
      expect(x).toBeLessThanOrEqual(box.maxX);
      expect(x).toBeGreaterThanOrEqual(box.minX);
      expect(y).toBeLessThanOrEqual(box.maxY);
      expect(y).toBeGreaterThanOrEqual(box.minY);
    }
  });

  test("the segment after a skipped one is drawn from an earlier point: its end join is taken at its longest", () => {
    // At 1.01 device pixels per 1000 units the stroke still has joins, and the short (0, 0.24) is under 1/4096
    // device pixels: skipped, it makes the next line run from (0, 0), 0.14 degrees off (1, 0), which turns the bevel
    // at (100, 0.24) into a miter reaching about 2 widths, beyond the 2 widths around (0, 0.24).
    const turn = (151.1 * Math.PI) / 180;
    const points: [number, number][] = [
      [0, 0],
      [0, 0.24],
      [100, 0.24],
      [100 + 3000 * Math.cos(turn), 0.24 + 3000 * Math.sin(turn)],
    ];
    const d = points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`)
      .join(" ");
    const box = bounds(d, 1000);
    for (const [x, y] of reach(skipped(points, 1000 / 1.01 / 4096), 500)) {
      expect(x).toBeLessThanOrEqual(box.maxX);
      expect(x).toBeGreaterThanOrEqual(box.minX);
      expect(y).toBeLessThanOrEqual(box.maxY);
      expect(y).toBeGreaterThanOrEqual(box.minY);
    }
  });

  test("polylines with short segments hold every miter tip at any scale that keeps joins", () => {
    let seed = 1068;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let round = 0; round < 400; round++) {
      const width = 1 + random() * 999;
      const points: [number, number][] = [
        [(random() - 0.5) * 4 * width, (random() - 0.5) * 4 * width],
      ];
      let angle = random() * 2 * Math.PI;
      for (let index = 0; index < 6; index++) {
        const length =
          random() < 0.4 ? width * (1e-4 + random() * 2e-3) : width * (0.2 + random() * 4);
        angle += (random() - 0.5) * 2 * Math.PI;
        const [x, y] = points[points.length - 1] ?? [0, 0];
        points.push([x + length * Math.cos(angle), y + length * Math.sin(angle)]);
      }
      const d = points
        .map(([x, y], index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`)
        .join(" ");
      const box = bounds(d, width);
      // A stroke wider than 1 device pixel at scale s skips lines shorter than 1/(4096 s) < width / 4096.
      for (const tolerance of [0, width / 16_384, width / 8192, width / 4096]) {
        for (const [x, y] of reach(skipped(points, tolerance), width / 2)) {
          const message = `${d} width ${String(width)} tolerance ${String(tolerance)}`;
          expect(x, message).toBeLessThanOrEqual(box.maxX + 1e-6 * width);
          expect(x, message).toBeGreaterThanOrEqual(box.minX - 1e-6 * width);
          expect(y, message).toBeLessThanOrEqual(box.maxY + 1e-6 * width);
          expect(y, message).toBeGreaterThanOrEqual(box.minY - 1e-6 * width);
        }
      }
    }
  });

  test("no point, no box", () => {
    expect(strokeBounds("", 10)).toBeUndefined();
    expect(strokeBounds("not path data", 10)).toBeUndefined();
  });
});

/** The points Skia strokes: a line ending within `tolerance` (per axis) of the last point kept is skipped. */
function skipped(
  points: readonly (readonly [number, number])[],
  tolerance: number,
): [number, number][] {
  const kept: [number, number][] = [];
  for (const [x, y] of points) {
    const [lastX, lastY] = kept[kept.length - 1] ?? [Infinity, Infinity];
    if (kept.length > 0 && Math.abs(x - lastX) <= tolerance && Math.abs(y - lastY) <= tolerance)
      continue;
    kept.push([x, y]);
  }
  return kept;
}

/**
 * The outermost points of a polyline's stroke (oracle): the corners of each segment and
 * the miter tips of each join (limit 4, both sides).
 */
function reach(points: readonly (readonly [number, number])[], half: number): [number, number][] {
  const out: [number, number][] = [];
  const unit = (index: number): [number, number] => {
    const [x0 = 0, y0 = 0] = points[index] ?? [];
    const [x1 = 0, y1 = 0] = points[index + 1] ?? [];
    const size = Math.hypot(x1 - x0, y1 - y0);
    return [(x1 - x0) / size, (y1 - y0) / size];
  };
  for (let index = 0; index + 1 < points.length; index++) {
    const [tx, ty] = unit(index);
    for (const end of [points[index], points[index + 1]]) {
      const [x = 0, y = 0] = end ?? [];
      out.push([x - ty * half, y + tx * half], [x + ty * half, y - tx * half]);
    }
    if (index + 2 < points.length) {
      const [ux, uy] = unit(index + 1);
      const turn = 1 + tx * ux + ty * uy;
      if (turn >= 0.125) {
        const [x = 0, y = 0] = points[index + 1] ?? [];
        const dx = (half * (-ty - uy)) / turn;
        const dy = (half * (tx + ux)) / turn;
        out.push([x + dx, y + dy], [x - dx, y - dy]);
      }
    }
  }
  return out;
}
