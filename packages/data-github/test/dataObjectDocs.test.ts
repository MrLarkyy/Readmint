import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { GITHUB_DATA_VERSION } from "../src/index.js";
import { keyPaths } from "./keyPaths.js";

const docs = readFileSync(new URL("../../../docs/data-github.md", import.meta.url), "utf8");
const expected: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/expected-github-data.json", import.meta.url), "utf8"),
);

function documentedPaths(): string[] {
  const section = docs.split(/^## /m).find((part) => part.startsWith("Data object"));
  if (section === undefined) throw new Error("docs/data-github.md has no Data object section");
  return [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1] ?? "");
}

test("the field table lists exactly the paths of the data object", () => {
  const documented = documentedPaths();
  expect(new Set(documented).size).toBe(documented.length);
  // The fixture user reads no commits, so `languagesAuthored` is empty there: its entries come from a sample.
  const authored = keyPaths({
    languagesAuthored: [{ name: "Kotlin", color: null, share: 1, additions: 1 }],
  });
  expect([...documented].sort()).toEqual([...new Set([...keyPaths(expected), ...authored])].sort());
});

test("the documented version is GITHUB_DATA_VERSION", () => {
  const match = /^Current version: \*\*(\d+)\*\*/m.exec(docs);
  expect(Number(match?.[1])).toBe(GITHUB_DATA_VERSION);
});
