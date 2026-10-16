import { expect, test } from "vitest";
import {
  chooseSection,
  createEditorState,
  EditorLimits,
  loadSettings,
  newDesign,
} from "../src/index.js";

const empty = createEditorState(newDesign());
const text = '{"header": {"title": "Hi"}, "other": {"title": "O"}}';

test("takes a settings file and applies the preferred section when it has it", () => {
  const next = loadSettings(empty, text, "header");
  expect(next.settings?.section).toBe("header");
  expect(Object.keys(next.settings?.sections ?? {})).toEqual(["header", "other"]);
  expect(next.issues).toEqual([]);
});

test("applies no section when the file lacks the preferred one", () => {
  expect(loadSettings(empty, text, "nope").settings?.section).toBeUndefined();
  expect(loadSettings(empty, text).settings?.section).toBeUndefined();
});

test.each([
  ["not JSON", "{header:", /not valid JSON/u],
  ["an array", "[1]", /expected an object of sections/u],
  ["a bad section key", '{"1x": {}}', /section name must be an id/u],
  ["a prototype key", '{"__proto__": {"a": "s3cret"}}', /section name must be an id/u],
  ["a bad value", '{"a": {"b": {"c": "s3cret"}}}', /expected a string, number/u],
])("refuses %s and keeps the state", (_name, input, message) => {
  const loaded = loadSettings(empty, text, "header");
  const next = loadSettings(loaded, input);
  expect(next.settings).toBe(loaded.settings);
  expect(next.issues).toMatchObject([{ source: "settings", message }]);
  expect(JSON.stringify(next.issues)).not.toContain("s3cret");
});

test("refuses a file over the size cap", () => {
  const next = loadSettings(empty, " ".repeat(EditorLimits.maxSettingsBytes + 1));
  expect(next.settings).toBeUndefined();
  expect(next.issues[0]?.message).toMatch(/larger than/u);
});

test("chooseSection picks, clears and refuses a section the file lacks", () => {
  const loaded = loadSettings(empty, text, "header");
  expect(chooseSection(loaded, "other").settings?.section).toBe("other");
  expect(chooseSection(loaded, undefined).settings?.section).toBeUndefined();
  const refused = chooseSection(loaded, "nope");
  expect(refused.settings).toBe(loaded.settings);
  expect(refused.issues).toMatchObject([{ source: "settings" }]);
  expect(chooseSection(empty, "x").issues).toMatchObject([{ source: "settings" }]);
});
