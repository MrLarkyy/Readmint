import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import * as main from "../src/index.js";
import * as node from "../src/node/index.js";

const sourceDir = join(import.meta.dirname, "..", "src");
const nodeDir = join(sourceDir, "node");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

test("the main entry is browser-safe: only src/node imports node: modules", () => {
  const offenders = sourceFiles(sourceDir)
    .filter((path) => !path.startsWith(nodeDir))
    .filter((path) =>
      /(?:from\s+|import\s*\(?\s*)["']node:|\bprocess\.|\bBuffer\b/.test(
        readFileSync(path, "utf8"),
      ),
    )
    .map((path) => relative(sourceDir, path));
  expect(offenders).toEqual([]);
});

test("nothing outside src/node imports from it", () => {
  const offenders = sourceFiles(sourceDir)
    .filter((path) => !path.startsWith(nodeDir))
    .filter((path) => /from\s+["']\.\/node\//.test(readFileSync(path, "utf8")))
    .map((path) => relative(sourceDir, path));
  expect(offenders).toEqual([]);
});

test("exposes its package name and the pinned API", () => {
  expect(main.packageName).toBe("@readmint/data-json");
  expect(Object.keys(main).sort()).toEqual([
    "JSON_DATA_DEFAULT_NAMESPACE",
    "JSON_DATA_VERSION",
    "JsonLimits",
    "jsonDataSource",
    "loadJsonData",
    "packageName",
  ]);
  expect(Object.isFrozen(main.JsonLimits)).toBe(true);
  expect(Object.keys(node)).toEqual(["workspaceFileReader"]);
});

test("has no dependency besides @readmint/data", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as Record<string, unknown>;
  expect(manifest.dependencies).toEqual({ "@readmint/data": "workspace:*" });
  expect(manifest.devDependencies).toBeUndefined();
});
