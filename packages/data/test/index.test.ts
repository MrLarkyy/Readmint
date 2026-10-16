import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import * as main from "../src/index.js";
import * as node from "../src/node/index.js";

test("exposes its package name and the pinned API", () => {
  expect(main.packageName).toBe("@readmint/data");
  expect(Object.keys(main).sort()).toEqual([
    "DATA_SOURCE_COMMON_ERROR_CODES",
    "DATA_SOURCE_INTERFACE_VERSION",
    "DataSourceError",
    "HttpsLimits",
    "MemoryCache",
    "checkDataSource",
    "checkHttpsUrl",
    "dataSourceCacheKey",
    "fetchHttpsText",
    "isDataNamespace",
    "mediaTypeCheck",
    "packageName",
    "readBodyCapped",
    "sha256Hex",
  ]);
  expect(main.DATA_SOURCE_INTERFACE_VERSION).toBe(0);
});

test("is browser-safe and has no dependencies", () => {
  const dir = join(import.meta.dirname, "..", "src");
  const files = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile());
  for (const file of files) {
    expect(readFileSync(join(dir, file.name), "utf8"), file.name).not.toMatch(
      /(?:from\s+|import\s*\(?\s*)["']node:/,
    );
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

test("exposes the file cache on the node entry", () => {
  expect(Object.keys(node).sort()).toEqual(["FILE_CACHE_MAX_ENTRY_BYTES", "FileCache"]);
});
