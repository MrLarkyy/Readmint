import { expect, test } from "vitest";
import { designJsonSchema, ValueRanges } from "../src/index.js";

test("the ranges cannot be changed by a consumer", () => {
  expect(Object.isFrozen(ValueRanges)).toBe(true);
  for (const range of Object.values(ValueRanges)) expect(Object.isFrozen(range)).toBe(true);
});

test("the published schema reads its numbers from the shared ranges", () => {
  const canvas = (designJsonSchema["properties"] as Record<string, Record<string, unknown>>)[
    "canvas"
  ];
  const width = (canvas?.["properties"] as Record<string, { anyOf: Record<string, unknown>[] }>)[
    "width"
  ];
  expect(width?.anyOf[0]).toEqual({
    type: "integer",
    minimum: ValueRanges.canvasSide.minimum,
    maximum: ValueRanges.canvasSide.maximum,
  });
});
