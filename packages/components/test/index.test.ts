import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { calendarTemplates, packageName } from "../src/index.js";

test("exposes its package name", () => {
  expect(packageName).toBe("@readmint/components");
});

test("calendarTemplates lists exactly the template files", () => {
  const files = readdirSync(join(import.meta.dirname, "..", "templates")).sort();
  expect(files).toEqual(calendarTemplates.map((name) => `${name}.design.json`).sort());
  expect(Object.isFrozen(calendarTemplates)).toBe(true);
});
