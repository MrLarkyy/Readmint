import { expect, test } from "vitest";
import {
  exportDesign,
  importDesign,
  setLayerLet,
  setLayerProperty,
  setPalette,
} from "../src/index.js";
import { editState, rectPointer } from "./formatEdits.js";
import { editorSession } from "./editorSession.js";

test("exports two-space JSON with a final line feed, the same bytes every time", () => {
  const design = editorSession().design;
  const text = exportDesign(design);
  expect(text.endsWith("}\n")).toBe(true);
  expect(text.startsWith('{\n  "version": 0,\n')).toBe(true);
  expect(exportDesign(structuredClone(design))).toBe(text);
});

test("the export of an imported YAML design re-imports to a deep-equal design", async () => {
  const yaml = [
    "version: 0",
    "canvas: { width: 100, height: 40 }",
    "layers:",
    "  - { type: rect, id: card, width: 100, height: 40, fill: '{{theme.bg}}' }",
    "",
  ].join("\n");
  const first = await importDesign(yaml);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(await importDesign(exportDesign(first.value))).toEqual({ ok: true, value: first.value });
});

test("orbit, let and palette round-trip through JSON with __proto__ names as own keys", async () => {
  let state = editState();
  state = setLayerProperty(state, `${rectPointer}/orbit`, "radiusY", 20);
  state = setLayerProperty(state, `${rectPointer}/orbit`, "speed", 90);
  state = setLayerProperty(state, `${rectPointer}/orbit`, "upright", false);
  state = setLayerProperty(state, `${rectPointer}/orbit`, "fade", { from: -1, to: 1 });
  state = setLayerLet(state, rectPointer, [
    ["__proto__", "{{ 1 }}"],
    ["b", "{{ __proto__ + 1 }}"],
  ]);
  expect(state.issues).toEqual([]);
  state = setLayerProperty(state, "/canvas", "background", "#ffffff");
  state = setLayerProperty(state, rectPointer, "fill", "#000000");
  state = setPalette(state, [["light", [["__proto__", "#112233"]]]]);
  expect(state.issues).toEqual([]);
  const imported = await importDesign(exportDesign(state.design));
  expect(imported).toEqual({ ok: true, value: state.design });
  if (!imported.ok) return;
  const group = imported.value.layers[0] as unknown as { children: Record<string, unknown>[] };
  const layer = group.children[0];
  expect(Object.hasOwn(layer?.["let"] as object, "__proto__")).toBe(true);
  expect(Object.hasOwn(imported.value.palette?.["light"] ?? {}, "__proto__")).toBe(true);
  expect(Object.keys(Object.prototype)).toEqual([]);
});
