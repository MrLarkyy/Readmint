import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDesignProps } from "@readmint/format";
import { expect, test } from "vitest";
import {
  chooseSection,
  createEditorState,
  exportSettings,
  loadSettings,
  newDesign,
  setSettingsProp,
  type EditorSettings,
} from "../src/index.js";
import { sectionSpans } from "../src/settingsSpans.js";

const pinscreen = readFileSync(
  fileURLToPath(
    new URL("../../components/templates/profiles/pinscreen/settings.json", import.meta.url),
  ),
  "utf8",
);
const empty = createEditorState(newDesign());
const load = (text: string, section: string) =>
  chooseSection(loadSettings(empty, text, section), section);

function settingsOf(state: ReturnType<typeof load>): EditorSettings {
  if (state.settings === undefined) throw new Error("no settings");
  return state.settings;
}

function propsOf(text: string) {
  const result = parseDesignProps(text);
  if (!result.ok) throw new Error("export does not parse");
  return result.value;
}

test("without an edit the export is the loaded text, BOM and odd whitespace included", () => {
  const odd = '﻿  {\r\n\t"a" :{ "x":"1" ,"y" : [ 1 ,2 ]},\r\n "b":{}  }\r\n\r\n';
  expect(exportSettings(settingsOf(load(odd, "a")))).toBe(odd);
  expect(exportSettings(settingsOf(load(pinscreen, "header")))).toBe(pinscreen);
});

test("an edit changes only the bytes of its section", () => {
  const edited = setSettingsProp(load(pinscreen, "header"), "role", "Maintainer");
  const out = exportSettings(settingsOf(edited));
  const before = sectionSpans(pinscreen).get("header");
  const after = sectionSpans(out).get("header");
  expect(before).toBeDefined();
  expect(after).toBeDefined();
  if (before === undefined || after === undefined) return;
  expect(out.slice(0, after.start)).toBe(pinscreen.slice(0, before.start));
  expect(out.slice(after.end)).toBe(pinscreen.slice(before.end));
  expect(out.slice(after.start, after.end)).toContain('"role": "Maintainer"');
  expect(propsOf(out)).toEqual(edited.settings?.sections);
  expect(propsOf(out)["stack"]).toEqual(propsOf(pinscreen)["stack"]);
});

test("editing a prop back to its loaded value exports the loaded text", () => {
  const state = load(pinscreen, "header");
  const edited = setSettingsProp(setSettingsProp(state, "role", "Maintainer"), "role", "");
  expect(exportSettings(settingsOf(edited))).toBe(pinscreen);
  const removed = setSettingsProp(state, "role", undefined);
  expect(exportSettings(settingsOf(removed))).not.toBe(pinscreen);
  // The prop moved to the end: the same props, so the loaded text still stands.
  expect(exportSettings(settingsOf(setSettingsProp(removed, "role", "")))).toBe(pinscreen);
});

test("a section named like an Object member and values with quotes and braces survive", () => {
  const tail = '"other": {"b": "}{\\\\"}\n}\n';
  const text = `{\n  "constructor": {"a": "x\\"}"},\n  ${tail}`;
  const edited = setSettingsProp(load(text, "constructor"), "a", 'q"}\\{"');
  const out = exportSettings(settingsOf(edited));
  expect(propsOf(out)["constructor"]).toEqual({ a: 'q"}\\{"' });
  expect(out.endsWith(tail)).toBe(true);
  expect(Object.prototype).not.toHaveProperty("a");
});

test("a session without a loaded text writes every section", () => {
  const text = exportSettings({ sections: propsOf('{"a": {"x": 1}}') });
  expect(text).toBe('{\n  "a": {\n    "x": 1\n  }\n}\n');
});

test("an edited section is written at the key's indent", () => {
  const text = '{\n    "a": {\n        "x": 1\n    },\n    "b": {}\n}';
  const edited = setSettingsProp(load(text, "a"), "x", 2);
  expect(exportSettings(settingsOf(edited))).toBe(
    '{\n    "a": {\n      "x": 2\n    },\n    "b": {}\n}',
  );
});
