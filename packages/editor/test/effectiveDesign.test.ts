import { expect, test } from "vitest";
import {
  chooseSection,
  createHistory,
  recordEdit,
  redo,
  undo,
  createEditorState,
  effectiveDesign,
  loadSettings,
  newDesign,
} from "../src/index.js";
import { settingsDesign, settingsText } from "./settingsDesign.js";

const base = createEditorState(settingsDesign);
const withSection = (section: string) => loadSettings(base, settingsText, section);

test("without settings or a section the design is the design itself", () => {
  expect(effectiveDesign(base).design).toBe(base.design);
  expect(effectiveDesign(chooseSection(withSection("header"), undefined))).toEqual({
    design: base.design,
    issues: [],
    warnings: [],
    unknownProps: [],
  });
});

test("applies the section to the root component", () => {
  const { design, issues } = effectiveDesign(withSection("header"));
  expect(issues).toEqual([]);
  expect(design.layers[0]).toMatchObject({ props: { color: "#ff0000" } });
  expect(base.design.layers[0]).not.toHaveProperty("props");
});

test("a prop the design does not declare is a warning, not an error, and the preview is not blocked", () => {
  const { design, issues, warnings, unknownProps } = effectiveDesign(withSection("broken"));
  expect(design).toBe(base.design);
  expect(issues).toEqual([]);
  expect(unknownProps).toEqual(["missing"]);
  expect(warnings.map((warning) => warning.severity)).toEqual(["warning", "warning"]);
  expect(warnings[0]?.message).toContain("settings /broken/missing: no top-level component");
  expect(warnings[1]?.message).toBe(
    "settings /broken/color: not set in the section; the design's value is used",
  );
  expect(JSON.stringify(warnings)).not.toContain("s3cret");
});

test("declared props apply next to an unknown one", () => {
  const state = loadSettings(base, '{"s": {"color": "#123456", "extra": 1}}', "s");
  const { design, issues, warnings, unknownProps } = effectiveDesign(state);
  expect(issues).toEqual([]);
  expect(design.layers[0]).toMatchObject({ props: { color: "#123456" } });
  expect(warnings).toHaveLength(1);
  expect(unknownProps).toEqual(["extra"]);
});

test("a declared prop of the wrong type is still an error without its value", () => {
  const state = loadSettings(base, '{"s": {"color": 5}}', "s");
  const { design, issues } = effectiveDesign(state);
  expect(design).toBe(base.design);
  expect(issues).toMatchObject([
    { source: "settings", message: expect.stringContaining("/s/color") as string },
  ]);
  expect(issues[0]?.severity).toBeUndefined();
});

test("warnings are capped at 100", () => {
  const props = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`p${String(i)}`, i]));
  const { warnings, unknownProps } = effectiveDesign(
    loadSettings(base, JSON.stringify({ s: props }), "s"),
  );
  expect(unknownProps).toHaveLength(100);
  expect(warnings).toHaveLength(101);
  expect(warnings.at(-1)?.message).toBe("more settings warnings not shown");
});

test("a design without a component layer reports it", () => {
  const state = loadSettings(createEditorState(newDesign()), settingsText, "header");
  expect(effectiveDesign(state).issues).toMatchObject([{ source: "settings" }]);
});

test("settings survive undo and redo, and the restored design is re-applied", () => {
  const state = withSection("header");
  const edited = { ...state, design: { ...state.design, canvas: { width: 50, height: 50 } } };
  const history = recordEdit(createHistory(), state, edited);
  const back = undo(history, edited);
  expect(back?.state.settings).toBe(state.settings);
  const again = back === undefined ? undefined : redo(back.history, back.state);
  expect(again?.state.settings).toBe(state.settings);
  expect(effectiveDesign(again?.state ?? state).design.layers[0]).toMatchObject({
    props: { color: "#ff0000" },
  });
});
