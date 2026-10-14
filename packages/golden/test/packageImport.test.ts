import { defineGoldenSuite } from "@readmint/golden";
import { normalizeSvg, rasterizeSvg } from "@readmint/golden/node";
import { goldenEnvironment } from "@readmint/golden/vitest";
import { expect, test } from "vitest";

test("the harness resolves through its package name without a build", () => {
  expect(typeof defineGoldenSuite).toBe("function");
  expect(normalizeSvg("<svg/>")).toBe("<svg/>\n");
  expect(typeof rasterizeSvg).toBe("function");
  expect(goldenEnvironment("test")).toEqual({ READMINT_GOLDEN_UPDATE: "0" });
});
