import { expect, test } from "vitest";
import {
  chooseSection,
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
  });
});

test("applies the section to the root component", () => {
  const { design, issues } = effectiveDesign(withSection("header"));
  expect(issues).toEqual([]);
  expect(design.layers[0]).toMatchObject({ props: { color: "#ff0000" } });
  expect(base.design.layers[0]).not.toHaveProperty("props");
});

test("a section that does not apply leaves the design and lists issues without the value", () => {
  const { design, issues } = effectiveDesign(withSection("broken"));
  expect(design).toBe(base.design);
  expect(issues).toMatchObject([
    { source: "settings", message: expect.stringContaining("/broken/missing") as string },
  ]);
  expect(JSON.stringify(issues)).not.toContain("s3cret");
});

test("a design without a component layer reports it", () => {
  const state = loadSettings(createEditorState(newDesign()), settingsText, "header");
  expect(effectiveDesign(state).issues).toMatchObject([{ source: "settings" }]);
});
