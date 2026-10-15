import type { LayerBox } from "@readmint/renderer";
import { expect, test } from "vitest";
import { placeBox } from "../src/boxPlacement.js";
import { layerAt, renderPreview } from "../src/index.js";

const boxes: LayerBox[] = [
  { layer: "/layers/0", x: 0, y: 0, width: 100, height: 100 },
  { layer: "/layers/1", x: 20, y: 20, width: 20, height: 20 },
  { layer: "/layers/2", x: 50, y: 40, width: 40, height: 20, rotation: 90 },
];

test("finds the topmost box at a point", () => {
  expect(layerAt(boxes, 25, 25)).toBe("/layers/1");
  expect(layerAt(boxes, 5, 5)).toBe("/layers/0");
  expect(layerAt(boxes, 150, 5)).toBeUndefined();
});

test("undoes a box's rotation about its centre", () => {
  // Turned 90 degrees, the 40 x 20 box at centre (70, 50) covers x 60..80 and y 30..70.
  expect(layerAt(boxes, 70, 32)).toBe("/layers/2");
  expect(layerAt(boxes, 85, 50)).toBe("/layers/0");
  expect(layerAt(boxes, 62, 68)).toBe("/layers/2");
});

test("selects in the renderer's boxes of a turned group", () => {
  const result = renderPreview({
    design: {
      version: 0,
      canvas: { width: 200, height: 200 },
      layers: [
        {
          type: "group",
          x: 50,
          y: 50,
          width: 100,
          height: 20,
          rotation: 90,
          children: [{ type: "rect", width: 20, height: 20 }],
        },
      ],
    },
    data: {},
    sessionAssets: {},
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // The group turns about (100, 60): its first 20 x 20 cell lands at x 90..110, y 10..30.
  expect(layerAt(result.layerBoxes ?? [], 100, 15)).toBe("/layers/0/children/0");
  expect(layerAt(result.layerBoxes ?? [], 100, 80)).toBe("/layers/0");
});

test("placeBox applies the own rotation, then the group turns, innermost first", () => {
  const box: LayerBox = {
    layer: "/layers/0/children/0",
    x: 110,
    y: 100,
    width: 10,
    height: 10,
    rotation: 45,
    groupTurns: [{ degrees: 90, cx: 120, cy: 110 }],
  };
  const place = placeBox(box);
  // The centre (115, 105) turned 90 degrees about (120, 110) is (125, 105).
  expect(place.cx).toBeCloseTo(125, 9);
  expect(place.cy).toBeCloseTo(105, 9);
  expect(place).toMatchObject({ degrees: 135, groupDegrees: 90 });
  expect(layerAt([box], 125, 105)).toBe(box.layer);
  expect(layerAt([box], 115, 105)).toBeUndefined();
});
