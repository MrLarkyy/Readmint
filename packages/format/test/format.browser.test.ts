import { expect, test } from "vitest";
import { applyDesignProps, parseDesign } from "../src/index.js";
import { parityCases, pinnedResults } from "./parityCases.js";

test.each(parityCases)("Chromium: $name matches the pinned result", ({ name, source }) => {
  expect(parseDesign(source)).toEqual(pinnedResults[name]);
});

test("Chromium: applyDesignProps merges a section into the root component layer", () => {
  const result = applyDesignProps(
    {
      version: 0,
      canvas: { width: 10, height: 10 },
      components: { c: { props: { t: { type: "string" } }, layers: [] } },
      layers: [{ type: "component", ref: "c" }],
    },
    { t: "hello" },
  );
  expect(result).toMatchObject({ ok: true, value: { layers: [{ props: { t: "hello" } }] } });
});
