import { expect, test } from "vitest";
import { importDesign } from "../src/index.js";

const minimalYaml = "version: 0\ncanvas: { width: 10, height: 10 }\nlayers: []\n";
const minimalJson = '{"version": 0, "canvas": {"width": 10, "height": 10}, "layers": []}';

test("imports a YAML design", async () => {
  const result = await importDesign(minimalYaml);
  expect(result.ok).toBe(true);
});

test("imports a JSON design", async () => {
  const result = await importDesign(minimalJson);
  expect(result.ok).toBe(true);
});

test("reports YAML problems with line and column", async () => {
  const result = await importDesign("version: 0\nlayers: [\n");
  expect(result).toMatchObject({
    ok: false,
    issues: [{ code: "parse", line: 3 }],
  });
});
