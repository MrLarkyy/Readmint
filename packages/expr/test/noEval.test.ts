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

test.each(sources)("%s runs no host code by name", (name) => {
  const text = readFileSync(`${sourceDirectory}${name}`, "utf8");
  const found = forbidden.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  expect(found).toEqual([]);
});
