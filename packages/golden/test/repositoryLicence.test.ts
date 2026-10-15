import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");
const license = (path: string) =>
  (JSON.parse(readFileSync(path, "utf8")) as { license?: string }).license;

test("the repository carries the MIT licence text", () => {
  expect(readFileSync(join(root, "LICENSE"), "utf8")).toMatch(
    /^MIT License\n\nCopyright \(c\) 2026 /,
  );
});

test("the root and every workspace package declare the MIT licence", () => {
  expect(license(join(root, "package.json")), "root").toBe("MIT");
  for (const name of readdirSync(join(root, "packages"))) {
    expect(license(join(root, "packages", name, "package.json")), name).toBe("MIT");
  }
});

test("the README names the licence", () => {
  expect(readFileSync(join(root, "README.md"), "utf8")).toMatch(/## Licence[\s\S]*MIT/);
});
