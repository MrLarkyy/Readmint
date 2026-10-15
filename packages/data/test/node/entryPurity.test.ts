import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("nothing outside src/node imports from it", () => {
  const dir = join(import.meta.dirname, "..", "..", "src");
  const offenders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) => /from\s+["']\.\/node\//.test(readFileSync(join(dir, entry.name), "utf8")))
    .map((entry) => entry.name);
  expect(offenders).toEqual([]);
});
