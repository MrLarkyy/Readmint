import { DesignLimits } from "@readmint/format";
import { expect, test } from "vitest";
import {
  exportDesign,
  exportDesignYaml,
  importDesign,
  setLayerLet,
  setLayerProperty,
  setPalette,
  uploadFont,
} from "../src/index.js";
import { editState, rectPointer } from "./formatEdits.js";
import { editorSession } from "./editorSession.js";
import { testFonts } from "./testFonts.js";

test("the YAML of an edited session re-imports to the same design", async () => {
  const state = editorSession();
  const result = await exportDesignYaml(state.design);
  if (!result.ok) throw new Error(result.message);
  expect(await importDesign(result.text)).toEqual({ ok: true, value: state.design });
});

test("the YAML of the restricted-font session re-imports to the same design", async () => {
  const state = editorSession(true);
  const result = await exportDesignYaml(state.design);
  if (!result.ok) throw new Error(result.message);
  expect(await importDesign(result.text)).toEqual({ ok: true, value: state.design });
});

test("a design with a large font is refused for YAML with a message naming JSON, and JSON still works", async () => {
  const font = testFonts.ttf.bytes;
  const padded = new Uint8Array(Math.ceil((DesignLimits.maxYamlSourceLength * 3) / 4));
  padded.set(font);
  const state = uploadFont(editorSession(), { name: "Large.ttf", bytes: padded });
  expect(state.issues).toEqual([]);
  expect(Object.keys(state.design.assets?.fonts ?? {})).toContain("Large");
  const before = structuredClone(state.design);
  const result = await exportDesignYaml(state.design);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.message).toContain("export JSON instead");
  expect(result.message).toContain(String(DesignLimits.maxYamlSourceLength));
  expect(state.design).toEqual(before);
  expect(exportDesign(state.design).length).toBeLessThanOrEqual(DesignLimits.maxSourceLength);
});

test("orbit, let and palette round-trip through YAML with __proto__ names as own keys", async () => {
  let state = editState();
  state = setLayerProperty(state, `${rectPointer}/orbit`, "fade", { from: -1, to: 1 });
  state = setLayerProperty(state, `${rectPointer}/orbit`, "upright", false);
  state = setLayerLet(state, rectPointer, [["__proto__", "{{ 1 }}"]]);
  state = setLayerProperty(state, "/canvas", "background", "#ffffff");
  state = setLayerProperty(state, rectPointer, "fill", "#000000");
  state = setPalette(state, [["light", [["__proto__", "#112233"]]]]);
  expect(state.issues).toEqual([]);
  const result = await exportDesignYaml(state.design);
  if (!result.ok) throw new Error(result.message);
  const imported = await importDesign(result.text);
  expect(imported).toEqual({ ok: true, value: state.design });
  if (!imported.ok) return;
  expect(Object.hasOwn(imported.value.palette?.["light"] ?? {}, "__proto__")).toBe(true);
  expect(Object.keys(Object.prototype)).toEqual([]);
});
