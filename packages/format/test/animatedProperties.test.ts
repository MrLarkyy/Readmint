import { expect, test } from "vitest";
import {
  animatedProperties,
  designJsonSchema,
  DesignLimits,
  validateDesign,
} from "../src/index.js";
import type { Layer } from "../src/index.js";

type Node = Record<string, unknown>;
const defs = (designJsonSchema as unknown as { $defs: Record<string, Node> }).$defs;

const trackRefs: Record<string, string> = {
  UnitTrack: "unit",
  PositionTrack: "position",
  ScaleTrack: "scale",
  RotationTrack: "rotation",
  ColourTrack: "colour",
};

function schemaTracks(type: string): [string, string][] {
  const variants = (defs["Layer"] as { oneOf: Node[] }).oneOf;
  const variant = variants.find((v) => {
    const t = (v["properties"] as Node)["type"] as Node;
    return t["const"] === type;
  }) as Node;
  const ref = ((variant["properties"] as Node)["animate"] as { $ref: string }).$ref;
  const animation = defs[ref.slice("#/$defs/".length)] as {
    properties: Record<string, { $ref: string }>;
  };
  return Object.entries(animation.properties).map(([name, node]) => [
    name,
    trackRefs[node.$ref.slice("#/$defs/".length)] as string,
  ]);
}

const types: Layer["type"][] = ["group", "rect", "ellipse", "path", "text", "image", "component"];

test.each(types)("the %s table equals the generated schema", (type) => {
  expect(animatedProperties(type).map((p) => [p.property, p.value])).toEqual(schemaTracks(type));
});

test("the table is frozen and lists each property once", () => {
  for (const type of types) {
    const list = animatedProperties(type);
    expect(Object.isFrozen(list)).toBe(true);
    expect(new Set(list.map((p) => p.property)).size).toBe(list.length);
  }
});

function design(count: number) {
  const keyframes = Array.from({ length: count }, (_, i) => ({
    offset: i / Math.max(1, count - 1),
    value: 1,
  }));
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    animation: { duration: 1000 },
    layers: [{ type: "rect", width: 10, height: 10, animate: { opacity: { keyframes } } }],
  };
}

test("the keyframe bounds are the shared limits", () => {
  expect(DesignLimits.minTrackKeyframes).toBe(2);
  expect(DesignLimits.maxTrackKeyframes).toBe(32);
  expect(validateDesign(design(DesignLimits.maxTrackKeyframes)).ok).toBe(true);
  expect(validateDesign(design(DesignLimits.maxTrackKeyframes + 1)).ok).toBe(false);
  expect(validateDesign(design(DesignLimits.minTrackKeyframes)).ok).toBe(true);
  expect(validateDesign(design(DesignLimits.minTrackKeyframes - 1)).ok).toBe(false);
});
