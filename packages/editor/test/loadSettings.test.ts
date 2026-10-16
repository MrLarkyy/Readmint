import { DesignLimits } from "@readmint/format";
import { expect, test } from "vitest";
import {
  chooseSection,
  createEditorState,
  EditorLimits,
  exportSettings,
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

test("keeps the loaded text and sections for the export", () => {
  const next = loadSettings(empty, text, "header");
  expect(next.settings?.source).toBe(text);
  expect(next.settings?.loaded).toBe(next.settings?.sections);
  expect(loadSettings(next, text).settings?.section).toBe("header");
});

test("refuses 10,000 levels of nesting with a clear message", () => {
  const deep = `{"a": {"b": ${"[".repeat(10_000)}${"]".repeat(10_000)}}}`;
  const next = loadSettings(empty, deep);
  expect(next.settings).toBeUndefined();
  expect(next.issues.length).toBeGreaterThan(0);
  expect(next.issues[0]?.message).toMatch(/^settings file: /u);
});

test("refuses __proto__ names by their pointer", () => {
  const section = loadSettings(empty, '{"__proto__": {"a": 1}}');
  expect(section.issues).toMatchObject([{ path: "/__proto__" }]);
  const prop = loadSettings(empty, '{"a": {"__proto__": 1}}');
  expect(prop.issues).toMatchObject([{ path: "/a/__proto__" }]);
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

test("loading a file again keeps the current section if the new file has it, else the preferred one, else none", () => {
  const loaded = chooseSection(loadSettings(empty, text, "header"), "other");
  expect(loadSettings(loaded, text, "header").settings?.section).toBe("other");
  expect(loadSettings(loaded, '{"header": {}, "x": {}}', "header").settings?.section).toBe(
    "header",
  );
  expect(loadSettings(loaded, '{"x": {}}', "header").settings?.section).toBeUndefined();
});

test("the size cap is the CLI's --props cap", () => {
  expect(EditorLimits.maxSettingsBytes).toBe(3 * DesignLimits.maxSourceLength + 3);
});

test("a BOM is not counted against the character limit and stays in the source", () => {
  const bom = String.fromCharCode(0xfeff);
  const head = '{"a":{"x":"';
  const tail = '"}}';
  const fill = "y".repeat(DesignLimits.maxSourceLength - head.length - tail.length);
  const body = head + fill + tail;
  expect(body.length).toBe(DesignLimits.maxSourceLength);
  const state = loadSettings(empty, bom + body, "a");
  expect(state.issues).toEqual([]);
  expect(state.settings?.source).toBe(bom + body);
  expect(exportSettings(state.settings ?? { sections: {} })).toBe(bom + body);
  expect(loadSettings(empty, body + " ").issues).not.toEqual([]);
});
