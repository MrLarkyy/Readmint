import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { calendarTemplates, packageName, starterTemplates } from "../src/index.js";

const templates = join(import.meta.dirname, "..", "templates");

test("exposes its package name", () => {
  expect(packageName).toBe("@readmint/components");
});

test("the template files are exactly the calendar and starter templates, plus the fonts folder", () => {
  const files = readdirSync(templates, { withFileTypes: true });
  expect(files.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).toEqual([
    "fonts",
  ]);
  expect(
    files
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort(),
  ).toEqual(
    [...calendarTemplates, ...starterTemplates].map((name) => `${name}.design.json`).sort(),
  );
});

test("the template lists are frozen and share no name", () => {
  expect(Object.isFrozen(calendarTemplates)).toBe(true);
  expect(Object.isFrozen(starterTemplates)).toBe(true);
  expect(
    starterTemplates.filter((name) => (calendarTemplates as readonly string[]).includes(name)),
  ).toEqual([]);
});
