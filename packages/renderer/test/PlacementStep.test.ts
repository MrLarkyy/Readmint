import { describe, expect, test } from "vitest";
import type { Bounds } from "../src/pathBounds.js";
import { linearEasing } from "../src/easing.js";
import type { NodeOrbit } from "../src/NodeOrbit.js";
import { orbitSteps, placeBounds, placeThrough } from "../src/PlacementStep.js";
import { sampleOrbit } from "../src/sampleOrbit.js";

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

describe("the steps of an orbit", () => {
  const ellipse: NodeOrbit = {
    cx: 120,
    cy: 70,
    rx: 90,
    ry: 40,
    parts: [
      { kind: "move", x: 120, y: 70 },
      { kind: "turn", degrees: 33.5, spin: undefined },
      { kind: "move", x: 65, y: 0 },
      { kind: "turn", degrees: -67, spin: undefined },
      { kind: "move", x: 25, y: 0 },
      { kind: "turn", degrees: 33.5, spin: undefined },
    ],
  };

  test("contain the box at its point on the ellipse", () => {
    const bounds = { minX: -6, minY: -4, maxX: 8, maxY: 3 };
    const placed = placeThrough(bounds, orbitSteps(sampleOrbit(ellipse, 0), false));
    if (placed === undefined) throw new Error("no box");
    const radians = (33.5 * Math.PI) / 180;
    const [x, y] = [120 + 90 * Math.cos(radians), 70 + 40 * Math.sin(radians)];
    for (const [cornerX, cornerY] of [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY],
    ] as const) {
      expect(x + cornerX).toBeGreaterThanOrEqual(placed.minX);
      expect(x + cornerX).toBeLessThanOrEqual(placed.maxX);
      expect(y + cornerY).toBeGreaterThanOrEqual(placed.minY);
      expect(y + cornerY).toBeLessThanOrEqual(placed.maxY);
    }
    // three turns of a box grow it by at most a factor of the square root of 2 each
    expect(placed.maxX - placed.minX).toBeLessThan(14 * 2 ** 1.5 + 4);
  });

  test("are unknown in the animated SVG where the orbit moves", () => {
    const spin = {
      duration: 1000,
      loop: true,
      dash: undefined,
      tracks: [
        {
          property: "rotation" as const,
          alpha: false,
          keyframes: [
            { position: 0, value: [0], easing: linearEasing },
            { position: 100_000, value: [360], easing: linearEasing },
          ],
        },
      ],
    };
    const moving: NodeOrbit = {
      ...ellipse,
      parts: ellipse.parts.map((part) => (part.kind === "turn" ? { ...part, spin } : part)),
    };
    const bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    expect(placeThrough(bounds, orbitSteps(sampleOrbit(moving, 0), true))).toBeUndefined();
    expect(placeThrough(bounds, orbitSteps(sampleOrbit(moving, 250), false))).toBeDefined();
    expect(sampleOrbit(moving, 250).filter((step) => step.kind === "spin")).toEqual([
      { kind: "spin", degrees: 90, animation: spin },
      { kind: "spin", degrees: 90, animation: spin },
      { kind: "spin", degrees: 90, animation: spin },
    ]);
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
