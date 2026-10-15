import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  calendarTemplates,
  packageName,
  profileTemplates,
  starterTemplates,
} from "../src/index.js";

const templates = join(import.meta.dirname, "..", "templates");

test("exposes its package name", () => {
  expect(packageName).toBe("@readmint/components");
});

test("the template files are exactly the calendar and starter templates, plus the fonts and profiles folders", () => {
  const files = readdirSync(templates, { withFileTypes: true });
  expect(files.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).toEqual([
    "fonts",
    "profiles",
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

test("each profile template folder holds a light and a dark design per section, a README and its fonts", () => {
  const folders = readdirSync(join(templates, "profiles"), { withFileTypes: true });
  expect(folders.every((entry) => entry.isDirectory())).toBe(true);
  expect(folders.map((entry) => entry.name).sort()).toEqual(Object.keys(profileTemplates).sort());
  for (const [name, sections] of Object.entries(profileTemplates)) {
    const folder = join(templates, "profiles", name);
    expect(existsSync(join(folder, "fonts")), name).toBe(true);
    expect(
      readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(
      [
        ...sections.flatMap((section) => [`${section}.json`, `${section}.dark.json`]),
        "README.md",
      ].sort(),
    );
  }
});

test("the template lists are frozen and share no name", () => {
  expect(Object.isFrozen(calendarTemplates)).toBe(true);
  expect(Object.isFrozen(starterTemplates)).toBe(true);
  expect(Object.isFrozen(profileTemplates)).toBe(true);
  for (const sections of Object.values(profileTemplates))
    expect(Object.isFrozen(sections)).toBe(true);
  expect(
    starterTemplates.filter((name) => (calendarTemplates as readonly string[]).includes(name)),
  ).toEqual([]);
  expect(
    Object.keys(profileTemplates).filter((name) =>
      [...calendarTemplates, ...starterTemplates].some((other) => other === name),
    ),
  ).toEqual([]);
});
