import { expect, test } from "vitest";
import { parseDesign } from "../src/index.js";
import { parityCases, pinnedResults } from "./parityCases.js";

test.each(parityCases)("Chromium: $name matches the pinned result", ({ name, source }) => {
  expect(parseDesign(source)).toEqual(pinnedResults[name]);
});
