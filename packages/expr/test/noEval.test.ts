import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));

/** Ways to run or reach host code the evaluator must never contain (ESLint bans the first two too). */
const forbidden: readonly [string, RegExp][] = [
  ["eval(", /\beval\s*\(/],
  ["Function(", /\bFunction\s*\(/],
  ["new Function", /\bnew\s+Function\b/],
  ["globalThis", /\bglobalThis\b/],
  ["dynamic import(", /\bimport\s*\(/],
  // A with statement, not a .with( call or a typed with(param: T) method.
  ["with (", /(?<![.\w])with\s*\((?![^)]*:)/],
  ["Reflect.", /\bReflect\./],
  ["Proxy", /\bnew\s+Proxy\b/],
];

const sources = readdirSync(sourceDirectory, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".ts"))
  .sort();

test.each([
  "eval(code)",
  "Function('return this')",
  "x = new Function",
  "globalThis.process",
  "await import('fs')",
  "with (scope) {}",
  "Reflect.get(o, k)",
  "new Proxy(o, {})",
])("the scan catches %s", (sample) => {
  expect(forbidden.some(([, pattern]) => pattern.test(sample))).toBe(true);
});

test("the scan does not flag scope.with( calls or a typed with( method", () => {
  for (const sample of ["scope.with({ a: 1 })", "with(locals: Locals): Scope;"]) {
    expect(forbidden.some(([, pattern]) => pattern.test(sample))).toBe(false);
  }
});

test("the scan sees the evaluator sources", () => {
  expect(sources).toContain("evaluate.ts");
  expect(sources).toContain("readProperty.ts");
  expect(sources.length).toBeGreaterThan(20);
});

/** Spaces and marks that look like nothing: the locale tables must spell them as escapes. */
function hasRawInvisible(text: string): boolean {
  for (const char of text) {
    const unit = char.charCodeAt(0);
    const control = unit < 0x20 && char !== "\n" && char !== "\r";
    const invisible =
      unit === 0x00a0 ||
      unit === 0x061c ||
      (unit >= 0x200b && unit <= 0x200f) ||
      (unit >= 0x2028 && unit <= 0x202f) ||
      (unit >= 0x2060 && unit <= 0x2069) ||
      unit === 0xfeff;
    if (control || invisible) return true;
  }
  return false;
}

test.each(sources)("%s holds no raw invisible character", (name) => {
  expect(hasRawInvisible(readFileSync(`${sourceDirectory}${name}`, "utf8"))).toBe(false);
});

test("the invisible-character scan catches a raw no-break space", () => {
  expect(hasRawInvisible(`a${String.fromCharCode(0xa0)}b`)).toBe(true);
  expect(hasRawInvisible("a\tb")).toBe(true);
  expect(hasRawInvisible("März 1\n")).toBe(false);
});

test.each(sources)("%s runs no host code by name", (name) => {
  const text = readFileSync(`${sourceDirectory}${name}`, "utf8");
  const found = forbidden.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  expect(found).toEqual([]);
});
