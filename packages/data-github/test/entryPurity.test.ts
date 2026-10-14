import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const sourceDir = join(import.meta.dirname, "..", "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

test("the main entry is browser-safe: only src/node imports node: modules", () => {
  const nodeDir = join(sourceDir, "node");
  const offenders = sourceFiles(sourceDir)
    .filter((path) => !path.startsWith(nodeDir))
    .filter((path) => /(?:from\s+|import\s*\(\s*)["']node:/.test(readFileSync(path, "utf8")))
    .map((path) => relative(sourceDir, path));
  expect(offenders).toEqual([]);
});

test("nothing outside src/node imports from it", () => {
  const offenders = sourceFiles(sourceDir)
    .filter((path) => !path.startsWith(join(sourceDir, "node")))
    .filter((path) => /from\s+["']\.\/node\//.test(readFileSync(path, "utf8")))
    .map((path) => relative(sourceDir, path));
  expect(offenders).toEqual([]);
});
