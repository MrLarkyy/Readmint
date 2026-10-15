import type { LayerBox } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { axisAligned, layerDelta, placeBox } from "../src/boxPlacement.js";
import { renderPreview } from "../src/index.js";

const box = (extra: Partial<LayerBox>): LayerBox => ({
  layer: "/layers/0/children/0",
  x: 0,
  y: 0,
  width: 10,
  height: 20,
  ...extra,
});

describe("axisAligned: corner handles only where width and height run along the canvas axes", () => {
  test.each([
    ["no turn", {}, true],
    ["a whole own turn", { rotation: 360 }, true],
    ["whole group turns", { groupTurns: [{ degrees: -360, cx: 0, cy: 0 }] }, true],
    ["an own turn", { rotation: 90 }, false],
    ["a group turn", { groupTurns: [{ degrees: 45, cx: 0, cy: 0 }] }, false],
    // The turns cancel on the canvas, but the layer's width runs along the group's turned y axis.
    [
      "an own 90 inside a group at -90",
      { rotation: 90, groupTurns: [{ degrees: -90, cx: 5, cy: 5 }] },
      false,
    ],
    [
      "group turns that sum to 360",
      {
        groupTurns: [
          { degrees: 180, cx: 0, cy: 0 },
          { degrees: 180, cx: 9, cy: 9 },
        ],
      },
      false,
    ],
  ] as const)("%s: %s", (_name, extra, aligned) => {
    expect(axisAligned(box(extra))).toBe(aligned);
  });
});

describe("layerDelta: a canvas drag in the layer's x/y coordinates", () => {
  const close = (value: { x: number; y: number }) => ({
    x: Math.round(value.x * 1e9) / 1e9 + 0,
    y: Math.round(value.y * 1e9) / 1e9 + 0,
  });

  test("is the drag itself without group turns, whatever the layer's own rotation", () => {
    expect(layerDelta(box({ rotation: 30 }), 7, -3)).toEqual({ x: 7, y: -3 });
  });

  test("is turned back through every group turn", () => {
    // A group turned 90 degrees clockwise: its +x points down the canvas, its +y to the left.
    const turned = box({ groupTurns: [{ degrees: 90, cx: 50, cy: 50 }] });
    expect(close(layerDelta(turned, 10, 0))).toEqual({ x: 0, y: -10 });
    expect(close(layerDelta(turned, 0, 10))).toEqual({ x: 10, y: 0 });
    // Inside it a group turned 90 again: 180 in all, the drag is reversed.
    const twice = box({
      groupTurns: [
        { degrees: 90, cx: 1, cy: 2 },
        { degrees: 90, cx: 50, cy: 50 },
      ],
    });
    expect(close(layerDelta(twice, 10, 4))).toEqual({ x: -10, y: -4 });
  });

  test("moves a layer in a turned group with the pointer: the renderer's boxes follow the drag", () => {
    const design = (x: number, y: number) => ({
      design: {
        version: 0 as const,
        canvas: { width: 200, height: 200 },
        layers: [
          {
            type: "group" as const,
            x: 50,
            y: 50,
            width: 100,
            height: 40,
            rotation: 90,
            children: [{ type: "rect" as const, x, y, width: 10, height: 10 }],
          },
        ],
      },
      data: {},
      sessionAssets: {},
    });
    const childBox = (input: ReturnType<typeof design>) => {
      const result = renderPreview(input);
      const child = result.ok ? result.layerBoxes?.[1] : undefined;
      if (child === undefined) throw new Error("no box");
      return child;
    };
    const start = childBox(design(10, 10));
    const delta = layerDelta(start, 12, -5);
    const before = placeBox(start);
    const after = placeBox(childBox(design(10 + Math.round(delta.x), 10 + Math.round(delta.y))));
    expect(close({ x: after.cx - before.cx, y: after.cy - before.cy })).toEqual({ x: 12, y: -5 });
  });
});
