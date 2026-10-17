import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { chooseSection, createEditorState, loadSettings, settingsFields } from "../src/index.js";
import { setVariant } from "../src/index.js";
import { noDarkDesign, settingsDesign, themeDesign } from "./settingsDesign.js";

const design: Design = {
  version: 0,
  canvas: { width: 100, height: 50 },
  components: {
    a: {
      props: {
        title: { type: "string", default: "T" },
        size: { type: "number" },
        tags: { type: "array" },
      },
      layers: [{ type: "rect", width: 1, height: 1 }],
    },
    b: {
      props: { title: { type: "string" }, mode: { type: "enum", values: ["x", "y"] } },
      layers: [{ type: "rect", width: 1, height: 1 }],
    },
  },
  layers: [
    { type: "component", ref: "a" },
    { type: "component", ref: "b" },
  ],
};

const stateOf = (text: string, section: string) =>
  chooseSection(loadSettings(createEditorState(design), text), section);

test("the fields follow declaration order, each prop once, with where the value comes from", () => {
  const { fields, unknown, truncated } = settingsFields(
    stateOf('{"s": {"size": 3, "extra": 1}}', "s"),
  );
  expect(fields.map((field) => [field.name, field.from, field.value])).toEqual([
    ["title", "default", "T"],
    ["size", "settings", 3],
    ["tags", "none", undefined],
    ["mode", "none", undefined],
  ]);
  expect(fields[0]?.definition).toBe(design.components?.["a"]?.props?.["title"]);
  expect(unknown).toEqual(["extra"]);
  expect(truncated).toBe(false);
});

test("no settings or no section: nothing", () => {
  const none = { fields: [], unknown: [], truncated: false };
  expect(settingsFields(createEditorState(settingsDesign))).toEqual(none);
  expect(settingsFields(loadSettings(createEditorState(design), '{"s": {}}'))).toEqual(none);
});

test("a section of 100,000 props lists at most 100 unknown ones, fast", () => {
  const props = Object.fromEntries(
    Array.from({ length: 100_000 }, (_, index) => [`p${String(index)}`, index]),
  );
  const state = stateOf(JSON.stringify({ s: props }), "s");
  const started = performance.now();
  const { unknown, truncated } = settingsFields(state);
  expect(unknown).toHaveLength(100);
  expect(truncated).toBe(true);
  expect(performance.now() - started).toBeLessThan(1000);
});

test("a layer's own value shows before the default, and the section's before both", () => {
  const withLayer: Design = {
    ...design,
    layers: [
      { type: "component", ref: "a", props: { title: "Own", size: 4 } },
      ...design.layers.slice(1),
    ],
  };
  const state = chooseSection(
    loadSettings(createEditorState(withLayer), '{"s": {"size": 9}}'),
    "s",
  );
  const { fields } = settingsFields(state);
  expect(fields.map((field) => [field.name, field.from, field.value])).toEqual([
    ["title", "layer", "Own"],
    ["size", "settings", 9],
    ["tags", "none", undefined],
    ["mode", "none", undefined],
  ]);
});

test("a prop the section lacks shows the variant's value while a variant is chosen", () => {
  const dark = setVariant(createEditorState(themeDesign), "dark");
  const state = chooseSection(loadSettings(dark, '{"s": {"w": 9}}'), "s");
  expect(
    settingsFields(state).fields.map((field) => [field.name, field.from, field.value]),
  ).toEqual([
    ["theme", "variant", "dark"],
    ["w", "settings", 9],
  ]);
  const own = chooseSection(loadSettings(dark, '{"s": {"theme": "light"}}'), "s");
  expect(settingsFields(own).fields[0]).toMatchObject({ from: "settings", value: "light" });
});

test("a variant that does not apply to the design gives no value to the form", () => {
  const state = chooseSection(
    loadSettings(setVariant(createEditorState(noDarkDesign), "dark"), '{"s": {"w": 9}}'),
    "s",
  );
  expect(
    settingsFields(state).fields.map((field) => [field.name, field.from, field.value]),
  ).toEqual([
    ["theme", "default", "light"],
    ["w", "settings", 9],
  ]);
});
