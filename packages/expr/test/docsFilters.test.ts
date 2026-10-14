import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { filterRegistry } from "../src/FilterRegistry.js";

const docs = readFileSync(new URL("../../../docs/expressions.md", import.meta.url), "utf8");

/** First backticked word of each table row in one `## ` section. */
function tableNames(heading: string): string[] {
  const start = docs.indexOf(`\n## ${heading}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = docs.indexOf("\n## ", start + 1);
  const section = docs.slice(start, end === -1 ? undefined : end);
  return [...section.matchAll(/^\| `([A-Za-z-]+)/gm)].map((match) => match[1] ?? "");
}

test("docs/expressions.md documents exactly the registered filters", () => {
  expect(tableNames("Filters").sort()).toEqual([...filterRegistry.keys()].sort());
});

test("docs/expressions.md lists every error code", () => {
  expect(tableNames("Errors")).toEqual([
    "syntax",
    "too-long",
    "too-deep",
    "unknown-name",
    "unknown-filter",
    "argument",
    "type",
    "not-finite",
    "too-large",
    "budget",
    "unknown-locale",
    "invalid-date",
    "invalid-data",
  ]);
});
