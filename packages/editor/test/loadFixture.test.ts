import { maxFixtureBytes } from "@readmint/cli";
import { expect, test } from "vitest";
import { createEditorState, EditorLimits, loadFixture, newDesign } from "../src/index.js";

const empty = createEditorState(newDesign());

test("takes a JSON object of data namespaces", () => {
  const next = loadFixture(empty, '{"repo": {"name": "readmint"}, "user": {"login": "octo"}}');
  expect(next.data).toEqual({ repo: { name: "readmint" }, user: { login: "octo" } });
  expect(next.issues).toEqual([]);
});

test("allows exactly what the CLI's --data file allows", () => {
  expect(EditorLimits.maxFixtureBytes).toBe(maxFixtureBytes);
});

test.each([
  ["not JSON", "{repo:", /is not valid JSON/u],
  ["an array", "[1, 2]", /must be a JSON object/u],
  ["null", "null", /must be a JSON object/u],
  ["a key that is no namespace", '{"Repo": {}}', /not a data namespace/u],
  ["a prototype key", '{"__proto__": {"polluted": true}}', /not a data namespace/u],
])("refuses %s and keeps the data", (_name, text, message) => {
  const loaded = loadFixture(empty, '{"repo": {}}');
  const next = loadFixture(loaded, text);
  expect(next.data).toBe(loaded.data);
  expect(next.issues).toMatchObject([{ source: "fixture", message }]);
  expect(next.issues[0]?.message).not.toContain("polluted");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("refuses more than maxFixtureBytes of UTF-8, counting multi-byte characters", () => {
  // Under the limit in UTF-16 code units, over it in UTF-8 bytes.
  const value = "é".repeat(EditorLimits.maxFixtureBytes / 2);
  const next = loadFixture(empty, `{"repo": {"name": "${value}"}}`);
  expect(next.data).toBe(empty.data);
  expect(next.issues).toMatchObject([{ message: /is larger than 8388608 bytes/u }]);
  expect(loadFixture(empty, `{"repo": {"name": "${"é".repeat(1000)}"}}`).issues).toEqual([]);
});
