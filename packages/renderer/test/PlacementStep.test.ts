import { describe, expect, test } from "vitest";
import type { Bounds } from "../src/pathBounds.js";
import { placeBounds } from "../src/PlacementStep.js";

/** The four corners of `bounds` turned by `degrees` about (cx, cy), by Math.cos and Math.sin (tests only). */
function turnedCorners(
  bounds: Bounds,
  degrees: number,
  cx: number,
  cy: number,
): [number, number][] {
  const radians = ((degrees % 360) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.maxY],
  ].map(([x = 0, y = 0]) => [
    cx + cos * (x - cx) - sin * (y - cy),
    cy + sin * (x - cx) + cos * (y - cy),
  ]);
}

describe("a turn", () => {
  const boxes: Bounds[] = [
    { minX: 498.5, minY: 498.5, maxX: 551.5, maxY: 551.5 },
    { minX: -20_000, minY: 3000, maxX: -19_000, maxY: 3500 },
    { minX: 0, minY: 0, maxX: 1e6, maxY: 10 },
  ];

  test.each([45, 30, 137.5, -200, 89.9995, 1e9])(
    "contains every corner turned %s degrees",
    (degrees) => {
      for (const bounds of boxes) {
        for (const centre of [
          [50, 50],
          [0, 0],
          [-700, 1200],
        ] as const) {
          const placed = placeBounds(bounds, {
            kind: "turn",
            degrees,
            cx: centre[0],
            cy: centre[1],
          });
          if (placed === undefined) throw new Error("no box");
          for (const [x, y] of turnedCorners(bounds, degrees, centre[0], centre[1])) {
            expect(x).toBeGreaterThanOrEqual(placed.minX);
            expect(x).toBeLessThanOrEqual(placed.maxX);
            expect(y).toBeGreaterThanOrEqual(placed.minY);
            expect(y).toBeLessThanOrEqual(placed.maxY);
          }
        }
      }
    },
  );

  test("is tight: a far child of a turned group stays far", () => {
    const placed = placeBounds(
      { minX: 498.5, minY: 498.5, maxX: 551.5, maxY: 551.5 },
      { kind: "turn", degrees: 45, cx: 50, cy: 50 },
    );
    expect(placed?.minY).toBeGreaterThan(600);
  });

  test("of a whole turn changes nothing", () => {
    const bounds = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(placeBounds(bounds, { kind: "turn", degrees: 720, cx: 9, cy: 9 })).toBe(bounds);
  });

  test("by a non-finite angle takes the L1 radius about the centre", () => {
    const bounds = { minX: 10, minY: 0, maxX: 20, maxY: 5 };
    expect(placeBounds(bounds, { kind: "turn", degrees: NaN, cx: 0, cy: 0 })).toEqual({
      minX: -25,
      minY: -25,
      maxX: 25,
      maxY: 25,
    });
  });
});

test("translate and scale are exact", () => {
  const bounds = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
  expect(placeBounds(bounds, { kind: "translate", x: 10, y: -10 })).toEqual({
    minX: 11,
    minY: -8,
    maxX: 13,
    maxY: -6,
  });
  expect(placeBounds(bounds, { kind: "scale", factor: -2 })).toEqual({
    minX: -6,
    minY: -8,
    maxX: -2,
    maxY: -4,
  });
  expect(placeBounds(bounds, { kind: "unknown" })).toBeUndefined();
});
