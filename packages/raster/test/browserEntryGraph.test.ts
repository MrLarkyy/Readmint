import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";

const packages = resolve(import.meta.dirname, "..", "..");
const importSpecifier = /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu;

function resolveImport(from: string, specifier: string): string | undefined {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(from), specifier.replace(/\.js$/u, ".ts"));
    return existsSync(target) ? target : undefined;
  }
  const workspace = /^@readmint\/([a-z-]+)$/u.exec(specifier)?.[1];
  return workspace === undefined ? undefined : join(packages, workspace, "src", "index.ts");
}

/** Every workspace source file the browser entry reaches. */
function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(importSpecifier)) {
      const next = resolveImport(file, match[1] ?? "");
      if (next !== undefined) queue.push(next);
    }
  }
  return [...seen];
}

test("the browser entry reaches no Node API through the workspace sources", () => {
  const files = reachable(join(packages, "raster", "src", "browser.ts"));
  expect(files.length).toBeGreaterThan(30);
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const code = text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    if (
      /["']node:|from\s+["'](?:fs|path|module|os|crypto|zlib|url)["']|\bBuffer\b|\brequire\s*\(|\bprocess\./u.test(
        code,
      )
    ) {
      offenders.push(file);
    }
  }
  expect(offenders).toEqual([]);
});

test("the graph walk sees the Node entry's file reads, so the scan can fail", () => {
  const files = reachable(join(packages, "raster", "src", "index.ts"));
  expect(files.some((file) => readFileSync(file, "utf8").includes("node:fs"))).toBe(true);
});
