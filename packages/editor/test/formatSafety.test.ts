import { expect, test } from "vitest";
import { parseField } from "../src/LayerField.js";
import { orbitFields } from "../src/orbitFields.js";
import { setLayerProperty } from "../src/index.js";
import { getAt } from "../src/designPointer.js";
import { editState, rectPointer } from "./formatEdits.js";

const state = editState();
const orbit = `${rectPointer}/orbit`;

test.each([Infinity, -Infinity, NaN])(
  "an orbit radius of %s is refused with the design unchanged",
  (value) => {
    const next = setLayerProperty(state, orbit, "radius", value);
    expect(next.design).toBe(state.design);
    expect(next.issues).toHaveLength(1);
  },
);

test.each(["1e400", "NaN", "Infinity", "-Infinity", "0x10 zz", ""])(
  "the orbit radius field refuses %j",
  (text) => {
    const field = orbitFields.find((one) => one.label === "radius")?.field;
    if (field === undefined) throw new Error("no radius field");
    expect(parseField(field, text).ok).toBe(false);
  },
);

test("an orbit angle outside [-360, 360] and a fade with equal ends are refused", () => {
  expect(setLayerProperty(state, orbit, "angle", 361).design).toBe(state.design);
  expect(setLayerProperty(state, orbit, "fade", { from: 1, to: 1 }).design).toBe(state.design);
});

test("a prototype key is refused as a pointer and never reaches a prototype", () => {
  const next = setLayerProperty(state, `${orbit}/__proto__`, "x", 1);
  expect(next.design).toBe(state.design);
  expect(Object.keys(Object.prototype)).toEqual([]);
});

test("editing the orbit keeps the layer's animate (cycles included) by identity", () => {
  const before = getAt(state.design, rectPointer) as Record<string, unknown>;
  expect(before["animate"]).toBeDefined();
  for (const next of [
    setLayerProperty(state, orbit, "angle", 45),
    setLayerProperty(state, orbit, "radiusY", 12),
    setLayerProperty(state, orbit, "upright", false),
    setLayerProperty(state, rectPointer, "orbit", undefined),
  ]) {
    expect(next.issues).toEqual([]);
    const after = getAt(next.design, rectPointer) as Record<string, unknown>;
    expect(after["animate"]).toBe(before["animate"]);
  }
});
