import { describe, expect, test } from "vitest";
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
