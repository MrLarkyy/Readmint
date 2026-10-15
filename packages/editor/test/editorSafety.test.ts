import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sourceDir = new URL("../src/", import.meta.url);
const sources = readdirSync(sourceDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => [name, readFileSync(new URL(name, sourceDir), "utf8")] as const);

const forbidden: readonly [string, RegExp][] = [
  ["markup parsing", /\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML|DOMParser|document\.write/u],
  ["code from strings", /\beval\s*\(|new\s+Function\b|setTimeout\(\s*["'`]/u],
  ["network", /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/u],
  ["Node APIs", /from\s+["']node:|require\s*\(/u],
  ["logging", /\bconsole\./u],
];

test("the editor sources exist", () => {
  expect(sources.length).toBeGreaterThan(20);
});

test.each(forbidden)("no editor source uses %s", (_what, pattern) => {
  expect(sources.filter(([, text]) => pattern.test(text)).map(([name]) => name)).toEqual([]);
});

test("the editor never depends on a data source that fetches with a token", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string> };
  expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
    "@readmint/data",
    "@readmint/fonts",
    "@readmint/format",
    "@readmint/renderer",
  ]);
  expect(sources.filter(([, text]) => text.includes("data-github"))).toEqual([]);
});
