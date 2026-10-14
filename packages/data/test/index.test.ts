import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import * as main from "../src/index.js";

test("exposes its package name and the pinned API", () => {
  expect(main.packageName).toBe("@readmint/data");
  expect(Object.keys(main).sort()).toEqual([
    "DATA_SOURCE_COMMON_ERROR_CODES",
    "DATA_SOURCE_INTERFACE_VERSION",
    "DataSourceError",
    "checkDataSource",
    "dataSourceCacheKey",
    "isDataNamespace",
    "packageName",
    "sha256Hex",
  ]);
  expect(main.DATA_SOURCE_INTERFACE_VERSION).toBe(0);
});

test("is browser-safe and has no dependencies", () => {
  const dir = join(import.meta.dirname, "..", "src");
  for (const file of readdirSync(dir)) {
    expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/from\s+["']node:/);
  }
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as Record<string, unknown>;
  expect(manifest.dependencies).toBeUndefined();
});

test("isDataNamespace follows the namespace rule", () => {
  expect(["github", "a1", "x".repeat(32)].every((name) => main.isDataNamespace(name))).toBe(true);
  expect(["", "Git", "a-b", "1a", "true", "x".repeat(33)].some(main.isDataNamespace)).toBe(false);
});
