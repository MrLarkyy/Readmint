import type { Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { pathBounds } from "../src/pathBounds.js";

function positions(group: Omit<Extract<Layer, { type: "group" }>, "type">): string[] {
  const result = renderSvg({
    version: 0,
    canvas: { width: 400, height: 400 },
    layers: [{ type: "group", ...group }],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return [...result.svg.matchAll(/<(?:rect|ellipse) ([^>]*)\/>/gu)].map((match) =>
    (match[1] ?? "").replace(/ fill="[^"]*"/u, ""),
  );
}

function box(width: number, height: number, extra: Partial<Layer> = {}): Layer {
  return { type: "rect", width, height, ...extra } as Layer;
}

describe("stack", () => {
  test("row with gap, centre alignment and offsets inside the slot", () => {
    expect(
      positions({
        layout: { type: "stack", direction: "row", gap: 5, align: "center" },
        children: [box(10, 20), box(10, 40, { x: 2 }), box(10, 10, { y: 3 })],
      }),
    ).toEqual([
      'x="0" y="10" width="10" height="20"',
      'x="17" y="0" width="10" height="40"',
      'x="30" y="18" width="10" height="10"',
    ]);
  });

  test("column aligned to the end of an explicit width", () => {
    expect(
      positions({
        width: 50,
        layout: { type: "stack", direction: "column", gap: 1, align: "end" },
        children: [box(10, 5), box(30, 5)],
      }),
    ).toEqual(['x="40" y="0" width="10" height="5"', 'x="20" y="6" width="30" height="5"']);
  });

  test("a hidden child takes no slot", () => {
    expect(
      positions({
        layout: { type: "stack", direction: "row" },
        children: [box(10, 5), box(10, 5, { visible: false }), box(10, 5)],
      }),
    ).toEqual(['x="0" y="0" width="10" height="5"', 'x="10" y="0" width="10" height="5"']);
  });
});

describe("grid", () => {
  test("cells from an explicit width, rows as tall as their tallest child", () => {
    expect(
      positions({
        width: 32,
        layout: { type: "grid", columns: 3, gap: 1 },
        children: [box(5, 5), box(5, 9), box(5, 5), box(5, 5, { x: 1, y: 1 })],
      }),
    ).toEqual([
      'x="0" y="0" width="5" height="5"',
      'x="11" y="0" width="5" height="9"',
      'x="22" y="0" width="5" height="5"',
      'x="1" y="11" width="5" height="5"',
    ]);
  });

  test("without a width, cells are as wide as the widest child", () => {
    expect(
      positions({
        layout: { type: "grid", columns: 2 },
        children: [box(4, 2), box(8, 2), box(2, 2)],
      }),
    ).toEqual([
      'x="0" y="0" width="4" height="2"',
      'x="8" y="0" width="8" height="2"',
      'x="0" y="2" width="2" height="2"',
    ]);
  });
});

describe("group extent", () => {
  test("a nested group is as large as its content in a parent stack", () => {
    expect(
      positions({
        layout: { type: "stack", direction: "row", gap: 2 },
        children: [
          { type: "group", children: [box(5, 5, { x: 10, y: 10 })] },
          { type: "ellipse", width: 4, height: 4 },
        ],
      }),
    ).toEqual(['x="10" y="10" width="5" height="5"', 'cx="19" cy="2" rx="2" ry="2"']);
  });

  test("rotation does not change the layout box", () => {
    expect(
      positions({
        layout: { type: "stack", direction: "row" },
        children: [box(10, 4, { rotation: 90 }), box(1, 1)],
      }),
    ).toEqual([
      'x="0" y="0" width="10" height="4" transform="rotate(90 5 2)"',
      'x="10" y="0" width="1" height="1"',
    ]);
  });
});

describe("path bounds", () => {
  test.each([
    ["absolute lines", "M10 20 L30 5 H40 V50 Z", { minX: 10, minY: 5, maxX: 40, maxY: 50 }],
    ["relative lines", "m10 10 l5 5 h-20 v-30 z", { minX: -5, minY: -15, maxX: 15, maxY: 15 }],
    ["implicit lineto after moveto", "M0 0 10 10 20 -5", { minX: 0, minY: -5, maxX: 20, maxY: 10 }],
    ["cubic control points", "M0 0 C10 -10 20 30 30 0", { minX: 0, minY: -10, maxX: 30, maxY: 30 }],
    [
      "smooth cubic reflects",
      "M0 0 C0 10 10 10 10 0 S20 -10 20 0",
      { minX: 0, minY: -10, maxX: 20, maxY: 10 },
    ],
    ["quadratic and smooth", "M0 0 Q5 10 10 0 T20 0", { minX: 0, minY: -10, maxX: 20, maxY: 10 }],
    ["compact numbers", "M.5.5-1-1e1", { minX: -1, minY: -10, maxX: 0.5, maxY: 0.5 }],
  ])("%s", (_name, d, expected) => {
    expect(pathBounds(d)).toEqual(expected);
  });

  test("an arc is contained conservatively, flags may be packed", () => {
    const bounds = pathBounds("M0 10 a10 10 0 1 1 20 0") ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    expect(bounds.minX).toBeLessThanOrEqual(0);
    expect(bounds.maxX).toBeGreaterThanOrEqual(20);
    expect(bounds.minY).toBeLessThanOrEqual(0);
    expect(bounds.maxY).toBeGreaterThanOrEqual(20);
    expect(pathBounds("M0 0a5 5 0 0010 0")).toEqual(pathBounds("M0 0 a5 5 0 0 0 10 0"));
  });

  test("radii too small for the chord are scaled, so the bound still holds", () => {
    const bounds = pathBounds("M0 0 A10 1 0 0 1 0 10") ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(100);
  });

  test("no points, garbage and a 100k-character path", () => {
    expect(pathBounds("")).toBeUndefined();
    expect(pathBounds("Z")).toBeUndefined();
    expect(pathBounds("M1 2 L")).toEqual({ minX: 1, minY: 2, maxX: 1, maxY: 2 });
    const long = `M0 0${" l1 1".repeat(20_000)}`;
    const started = performance.now();
    expect(pathBounds(long)).toEqual({ minX: 0, minY: 0, maxX: 20_000, maxY: 20_000 });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
