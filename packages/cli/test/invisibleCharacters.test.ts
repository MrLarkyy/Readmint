import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quoteInput } from "@readmint/format";
import { expect, test } from "vitest";
import { escapeForLog } from "../src/index.js";

const packagesDir = join(import.meta.dirname, "..", "..");

// format and expr keep one hand-copied predicate each (expr must not pull format's YAML parser into the
// browser bundle); this pins the copies equal so a fix to one cannot miss the other.
const predicateOf = (pkg: string): string => {
  const source = readFileSync(join(packagesDir, pkg, "src", "isInvisible.ts"), "utf8");
  const at = source.indexOf("export function isInvisible");
  expect(at, `${pkg} isInvisible marker`).toBeGreaterThanOrEqual(0);
  return source.slice(at);
};

test("format and expr share the same isInvisible predicate", () => {
  expect(predicateOf("expr")).toBe(predicateOf("format"));
});

test("every code unit format escapes is escaped by the CLI too", () => {
  const missed: string[] = [];
  for (let unit = 0; unit <= 0xffff; unit++) {
    if (unit >= 0xd800 && unit <= 0xdfff) continue;
    const char = String.fromCharCode(unit);
    // JSON.stringify escapes quotes and C0 controls itself; any other change quoteInput makes is isInvisible.
    const flagged = quoteInput(char) !== JSON.stringify(char);
    if (flagged && escapeForLog(char) === char) {
      missed.push(unit.toString(16));
    }
  }
  expect(missed).toEqual([]);
});
