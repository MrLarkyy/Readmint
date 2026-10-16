import { validateDesign, type ComponentPropValue } from "@readmint/format";
import { expect, test } from "vitest";
import {
  chooseSection,
  createEditorState,
  EditorLimits,
  exportSettings,
  loadSettings,
  newDesign,
  setSettingsProp,
  type EditorState,
} from "../src/index.js";

const empty = createEditorState(newDesign());
const text = '{"a": {"x": "1", "y": [1, 2]}, "b": {"z": true}}';
const state = chooseSection(loadSettings(empty, text, "a"), "a");
const propsOf = (s: EditorState) => s.settings?.sections["a"] ?? {};
const messages = (s: EditorState) => s.issues.map((issue) => issue.message);

test("sets, appends and removes while keeping order, and never mutates the state", () => {
  const before = JSON.stringify(state.settings?.sections);
  const set = setSettingsProp(state, "x", "9");
  expect(Object.entries(propsOf(set))).toEqual([
    ["x", "9"],
    ["y", [1, 2]],
  ]);
  const appended = setSettingsProp(set, "w", false);
  expect(Object.keys(propsOf(appended))).toEqual(["x", "y", "w"]);
  const removed = setSettingsProp(appended, "x", undefined);
  expect(Object.keys(propsOf(removed))).toEqual(["y", "w"]);
  expect(JSON.stringify(state.settings?.sections)).toBe(before);
  expect(removed.settings?.section).toBe("a");
  expect(removed.settings?.source).toBe(text);
  expect(removed.issues).toEqual([]);
});

test("records have no prototype and prototype-like prop names do not pollute", () => {
  const next = setSettingsProp(setSettingsProp(state, "constructor", "c"), "toString", "t");
  expect(Object.getPrototypeOf(propsOf(next))).toBeNull();
  expect(Object.getPrototypeOf(next.settings?.sections)).toBeNull();
  expect(propsOf(next)["constructor"]).toBe("c");
  expect({}.constructor).toBe(Object);
  expect(typeof {}.toString).toBe("function");
  const exported = JSON.parse(exportSettings(next.settings ?? { sections: {} })) as {
    a: Record<string, unknown>;
  };
  expect(exported.a["constructor"]).toBe("c");
});

test("removing a prop that is not there changes nothing", () => {
  expect(setSettingsProp(state, "nope", undefined).settings).toBe(state.settings);
});

test.each<[string, EditorState, string, ComponentPropValue, RegExp]>([
  ["no settings", empty, "x", "v", /^no settings file is loaded$/u],
  ["no section", loadSettings(empty, text), "x", "v", /^no settings section is chosen$/u],
  [
    "a prototype key",
    state,
    "__proto__",
    "s3cret-value",
    /^settings prop "__proto__": the prop name must be an id/u,
  ],
  [
    "NaN",
    state,
    "n",
    Number.NaN,
    /^settings prop "n": expected a string, number, boolean or a list of those$/u,
  ],
  [
    "a nested list",
    state,
    "n",
    [["s3cret-value"]] as never,
    /^settings prop "n": a list may only hold strings, numbers and booleans$/u,
  ],
  [
    "an object",
    state,
    "n",
    { k: "s3cret-value" } as never,
    /^settings prop "n": the value must be a string, a number, a boolean or a list of those$/u,
  ],
  [
    "1001 items",
    state,
    "n",
    Array.from({ length: 1001 }, () => "s3cret-value"),
    /^settings prop "n": the list has 1001 items, more than the 1000 a prop list may have$/u,
  ],
])("refuses %s with a clear message and keeps the state", (_name, from, prop, value, pattern) => {
  const next = setSettingsProp(from, prop, value);
  expect(next.settings).toBe(from.settings);
  expect(messages(next)).toHaveLength(1);
  expect(messages(next)[0]).toMatch(pattern);
  expect(JSON.stringify(next.issues)).not.toContain("s3cret-value");
});

test("refuses an edit that makes the file larger than the settings limit, naming both sizes", () => {
  // Three bytes per character: the loaded file fits, the added prop alone is under the character limit of a value.
  const loaded = chooseSection(
    loadSettings(empty, JSON.stringify({ a: { p: "€".repeat(2_000_000), r: "y" } }), "a"),
    "a",
  );
  expect(loaded.settings).toBeDefined();
  const next = setSettingsProp(loaded, "s", "€".repeat(4_100_000));
  expect(next.settings).toBe(loaded.settings);
  expect(messages(next)[0]).toMatch(
    new RegExp(
      `^settings prop "s": the settings file would be \\d+ bytes, more than the ${String(EditorLimits.maxSettingsBytes)} a settings file may have$`,
      "u",
    ),
  );
});

test("a hostile prop name is cut in the message", () => {
  const next = setSettingsProp(state, "é".repeat(5000), 1);
  expect(messages(next)[0]?.length).toBeLessThan(300);
});

test("the list limit is the design format's", () => {
  const design = (items: number) => ({
    version: 0,
    canvas: { width: 10, height: 10 },
    components: {
      c: {
        props: { p: { type: "array", default: Array.from({ length: items }, () => "a") } },
        layers: [{ type: "rect", width: 1, height: 1 }],
      },
    },
    layers: [{ type: "component", ref: "c" }],
  });
  expect(validateDesign(design(EditorLimits.maxSettingsListItems)).ok).toBe(true);
  expect(validateDesign(design(EditorLimits.maxSettingsListItems + 1)).ok).toBe(false);
});
