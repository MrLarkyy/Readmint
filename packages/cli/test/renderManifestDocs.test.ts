import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { type CliTree, makeCliTree, plainDesign } from "./cliTree.js";

const docs = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "cli.md"), "utf8");
const start = docs.indexOf("\n## Render manifest\n");
const section = docs.slice(start, docs.indexOf("\n## ", start + 1));

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("repo.json", plainDesign);
});

afterEach(async () => {
  await tree.remove();
});

async function lineOf(renders: unknown[], extra: string[] = []): Promise<string> {
  await tree.file("renders.json", { renders });
  const result = await tree.run([
    "render",
    "--manifest",
    "renders.json",
    "--out-dir",
    "out",
    ...extra,
  ]);
  expect(result.code).not.toBe(ExitCode.ok);
  return result.stderr.trim();
}

test("the section exists", () => {
  expect(start).toBeGreaterThan(-1);
});

test.each([
  [
    "duplicate-name",
    [
      { name: "repo", design: "repo.json" },
      { name: "Repo", design: "repo.json" },
    ],
    'manifest "renders.json": error duplicate-name at /renders/1/name: the name Repo is used twice (letter case is ignored)',
  ],
  [
    "pattern",
    [{ name: "a", design: "../repo.json" }],
    'manifest "renders.json": error pattern at /renders/0/design: the design must be a relative path inside the manifest folder: no empty, . or .. segment',
  ],
  [
    "unknown-reference",
    [{ name: "a", design: "missing.json" }],
    'manifest "renders.json": error unknown-reference at /renders/0/design: design file "missing.json" does not exist',
  ],
  [
    "duplicate-key",
    [{ name: "a", design: "repo.json", props: { theme: "dark" }, variants: ["dark"] }],
    'manifest "renders.json": error duplicate-key at /renders/0/props/theme: the prop theme is also set by the dark variant; set it in one place',
  ],
])("the %s line of the docs is what the CLI prints", async (_code, renders, line) => {
  expect(await lineOf(renders)).toBe(line);
  expect(section).toContain(line);
});
