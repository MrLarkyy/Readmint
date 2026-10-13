import { expect, test } from "vitest";
import { packageName } from "../src/index.js";

test("exposes its package name", () => {
  expect(packageName).toBe("@readmint/raster");
});
