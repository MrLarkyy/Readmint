import { describe, expect, test } from "vitest";
import type { Orbit } from "@readmint/format";
import { orbitFadeKeys, orbitFields } from "../src/orbitFields.js";
import { fieldText, layerFields, parseField, type LayerField } from "../src/LayerField.js";

const number: LayerField = { key: "x", kind: "number" };
const width: LayerField = { key: "width", kind: "number", required: true };
const paint: LayerField = { key: "fill", kind: "paint" };
const flag: LayerField = { key: "visible", kind: "boolean" };
const text: LayerField = { key: "name", kind: "text" };

describe("parseField", () => {
  test("numbers take literals and bindings", () => {
    expect(parseField(number, " 12.5 ")).toEqual({ ok: true, value: 12.5 });
    expect(parseField(number, "{{repo.stars * 2}}")).toEqual({
      ok: true,
      value: "{{repo.stars * 2}}",
    });
    expect(parseField(number, "12px")).toMatchObject({ ok: false });
    expect(parseField(number, "Infinity")).toMatchObject({ ok: false });
  });

  test("an empty optional field removes the property, a required one is kept for validation", () => {
    expect(parseField(number, "")).toEqual({ ok: true, value: undefined });
    expect(parseField(width, "")).toMatchObject({ ok: false });
    expect(parseField(text, "")).toEqual({ ok: true, value: undefined });
  });

  test("paints take colours, none, bindings and gradients as JSON", () => {
    expect(parseField(paint, "#ff0000")).toEqual({ ok: true, value: "#ff0000" });
    expect(parseField(paint, '{"type":"linear","stops":[]}')).toEqual({
      ok: true,
      value: { type: "linear", stops: [] },
    });
    expect(parseField(paint, "{broken")).toMatchObject({ ok: false });
  });

  test("booleans take true, false and bindings", () => {
    expect(parseField(flag, "false")).toEqual({ ok: true, value: false });
    expect(parseField(flag, "{{user.pro}}")).toEqual({ ok: true, value: "{{user.pro}}" });
    expect(parseField(flag, "yes")).toMatchObject({ ok: false });
  });

  test.each([
    [number, 12],
    [flag, true],
    [paint, "#fff"],
    [paint, { type: "linear", stops: [] }],
  ] as const)("fieldText reads back as the value, case %#", (field, value) => {
    expect(parseField(field, fieldText(value))).toEqual({ ok: true, value });
  });
});

test("every layer type has its own fields, from Design.ts", () => {
  const sources = { fonts: ["f"], images: ["i"], components: ["c"] };
  expect(layerFields({ type: "text", content: "" }, sources).map((field) => field.key)).toContain(
    "fontSize",
  );
  expect(
    layerFields({ type: "text", content: "" }, sources).find((field) => field.key === "maxLines"),
  ).toEqual({ key: "maxLines", kind: "number" });
  expect(
    layerFields({ type: "rect", width: 1, height: 1 }, sources).map((field) => field.key),
  ).not.toContain("maxLines");
  expect(
    layerFields({ type: "image", asset: "i", width: 1, height: 1 }, sources).find(
      (field) => field.key === "asset",
    ),
  ).toEqual({ key: "asset", kind: "choice", options: ["i"], required: true });
  expect(layerFields({ type: "path", d: "M0 0" }, sources).map((field) => field.key)).not.toContain(
    "width",
  );
});

test("an orbit is edited in its own fieldset, never as a layer field", () => {
  const sources = { fonts: [], images: [], components: [] };
  const orbit = { center: { x: 1, y: 2 }, radius: 3, angle: 4 };
  const fields = layerFields({ type: "ellipse", width: 1, height: 1, orbit }, sources);
  expect(fields.map((field) => field.key)).not.toContain("orbit");
  expect(fieldText(orbit)).toBe('{"center":{"x":1,"y":2},"radius":3,"angle":4}');
});

test("orbitFields lists every key of an Orbit but fade, which is a pair", () => {
  const keys = orbitFields.map(({ parent, field }) =>
    parent === "" ? field.key : `${parent}.${field.key}`,
  );
  expect(keys).toEqual(["center.x", "center.y", "radius", "radiusY", "angle", "speed", "upright"]);
  expect(orbitFadeKeys).toEqual(["from", "to"]);
  const every: Required<Orbit> = {
    center: { x: 0, y: 0 },
    radius: 0,
    radiusY: 0,
    angle: 0,
    speed: 0,
    upright: true,
    fade: { from: 0, to: 1 },
  };
  expect(new Set([...keys.filter((key) => !key.includes(".")), "center", "fade"])).toEqual(
    new Set(Object.keys(every)),
  );
});
