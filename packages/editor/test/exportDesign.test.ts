import { expect, test } from "vitest";
import { exportDesign, importDesign } from "../src/index.js";
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
