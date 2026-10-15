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

// The raster worker fetches the two WebAssembly files of its own origin (see the test below); nothing else fetches.
const mayFetch = "rasterWorker.ts";

test.each(forbidden)("no editor source uses %s", (what, pattern) => {
  const found = sources.filter(
    ([name, text]) => !(what === "network" && name === mayFetch) && pattern.test(text),
  );
  expect(found.map(([name]) => name)).toEqual([]);
});

test("the raster worker fetches only the two WebAssembly files the bundler gives it, and uses no other network API", () => {
  const worker = sources.find(([name]) => name === mayFetch)?.[1] ?? "";
  expect(worker).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/u);
  expect([...worker.matchAll(/fetch\s*\(([^)]*)\)/gu)].map((match) => match[1])).toEqual(["url"]);
  expect([...worker.matchAll(/wasmBytes\(([^)]*)\)/gu)].map((match) => match[1])).toEqual([
    "url: string",
    "resvgUrl",
    "webpUrl",
  ]);
  expect(worker).toMatch(/import resvgUrl from "@resvg\/resvg-wasm\/index_bg\.wasm\?url"/u);
  expect(worker).toMatch(/import webpUrl from "wasm-webp\/dist\/esm\/webp-wasm\.wasm\?url"/u);
});

test("the editor never depends on a data source that fetches with a token", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string> };
  expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
    "@readmint/data",
    "@readmint/fonts",
    "@readmint/format",
    "@readmint/raster",
    "@readmint/renderer",
    "@resvg/resvg-wasm",
    "wasm-webp",
  ]);
  expect(sources.filter(([, text]) => text.includes("data-github"))).toEqual([]);
});
