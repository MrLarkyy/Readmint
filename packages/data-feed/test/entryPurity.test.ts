import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import * as main from "../src/index.js";

const sourceDir = join(import.meta.dirname, "..", "src");

test("the entry is browser-safe: no node: module, process or Buffer", () => {
  const offenders = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) =>
      /(?:from\s+|import\s*\(?\s*)["']node:|\bprocess\.|\bBuffer\b/.test(
        readFileSync(join(sourceDir, entry.name), "utf8"),
      ),
    )
    .map((entry) => entry.name);
  expect(offenders).toEqual([]);
});

test("exposes its package name and the pinned API", () => {
  expect(main.packageName).toBe("@readmint/data-feed");
  expect(Object.keys(main).sort()).toEqual([
    "FEED_DATA_DEFAULT_NAMESPACE",
    "FEED_DATA_VERSION",
    "FeedLimits",
    "feedDataSource",
    "loadFeedData",
    "packageName",
  ]);
  expect(Object.isFrozen(main.FeedLimits)).toBe(true);
});

test("has no dependency besides @readmint/data and only the main entry", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as Record<string, unknown>;
  expect(manifest.dependencies).toEqual({ "@readmint/data": "workspace:*" });
  expect(manifest.devDependencies).toBeUndefined();
  expect(Object.keys(manifest.exports as object)).toEqual(["."]);
});
