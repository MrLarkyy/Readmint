import { expect, test } from "vitest";
import { parseDesign, validateDesign } from "../src/index.js";

const base = { version: 0, canvas: { width: 1, height: 1 }, layers: [] };

test("an unsupported locale is an enum issue at /locale naming the allowed values", () => {
  const result = validateDesign({ ...base, locale: "pl" });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues).toMatchObject([{ path: "/locale", code: "enum" }]);
  for (const tag of ["en", "de", "fr", "es", "cs"]) {
    expect(result.issues[0]?.message).toContain(tag);
  }
});

test("a YAML design can declare its locale", () => {
  const result = parseDesign(
    "version: 0\nlocale: cs\ncanvas: { width: 1, height: 1 }\nlayers: []\n",
    {
      format: "yaml",
    },
  );
  expect(result.ok && result.value.locale).toBe("cs");
});
