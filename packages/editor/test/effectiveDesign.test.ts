import { renderVariants, type RenderVariant } from "@readmint/format";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { importDesign } from "../src/index.js";
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
import { setVariant } from "../src/index.js";
import { noDarkDesign, settingsDesign, settingsText, themeDesign } from "./settingsDesign.js";

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
  expect(warnings.map((warning) => warning.severity)).toEqual(["warning"]);
  expect(warnings[0]?.message).toContain("settings /broken/missing: no top-level component");
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

const pin = (name: string) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../components/templates/profiles/pinscreen/${name}`, import.meta.url),
    ),
    "utf8",
  );

test("shipped settings that lack a defaulted or layer-set prop (theme) show no warning", async () => {
  for (const file of ["header.json"]) {
    const imported = await importDesign(pin(file));
    if (!imported.ok) throw new Error("pinscreen design does not import");
    const state = loadSettings(createEditorState(imported.value), pin("settings.json"), "header");
    const { warnings, issues, unknownProps } = effectiveDesign(state);
    expect(issues).toEqual([]);
    expect(unknownProps).toEqual([]);
    expect(warnings).toEqual([]);
  }
});

test("a declared prop with no section value, layer value or default is a warning", () => {
  const design = {
    ...base.design,
    components: {
      card: {
        props: { title: { type: "string" } },
        layers: [{ type: "rect", width: 5, height: 5 }],
      },
    },
  } as const;
  const state = loadSettings(createEditorState(design), '{"s": {}}', "s");
  const { warnings, issues } = effectiveDesign(state);
  expect(issues).toEqual([]);
  expect(warnings.map((warning) => warning.message)).toEqual([
    "settings /s/title: not set in the section, by a layer or by a default; nothing is rendered for it",
  ]);
});

const themed = createEditorState(themeDesign);
const layerProps = (design: ReturnType<typeof effectiveDesign>["design"]) =>
  (design.layers[0] as { props?: Record<string, unknown> }).props;

test("the dark variant sets theme on the root component layer, the state's design stays", () => {
  const { design, issues, warnings } = effectiveDesign(setVariant(themed, "dark"));
  expect(issues).toEqual([]);
  expect(warnings).toEqual([]);
  expect(layerProps(design)).toEqual({ theme: "dark" });
  expect(themed.design.layers[0]).not.toHaveProperty("props");
  expect(effectiveDesign(themed).design).toBe(themed.design);
});

test("the section applies after the variant, and a section that sets theme wins with a warning", () => {
  const dark = setVariant(themed, "dark");
  const other = loadSettings(dark, '{"s": {"w": 9}}', "s");
  const plainResult = effectiveDesign(other);
  expect(plainResult.issues).toEqual([]);
  expect(plainResult.warnings).toEqual([]);
  expect(layerProps(plainResult.design)).toEqual({ theme: "dark", w: 9 });
  const wins = effectiveDesign(loadSettings(dark, '{"s": {"theme": "light", "w": 9}}', "s"));
  expect(layerProps(wins.design)).toEqual({ theme: "light", w: 9 });
  expect(wins.warnings).toEqual([
    {
      source: "settings",
      severity: "warning",
      message: "settings /s/theme: the section sets it, which overrides the dark variant",
    },
  ]);
});

test("a variant the design does not declare is a variant issue and the design is shown as it is", () => {
  const state = {
    ...createEditorState(settingsDesign),
    variant: renderVariants[0] as RenderVariant,
  };
  const result = effectiveDesign(state);
  expect(result.design).toBe(state.design);
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]?.source).toBe("variant");
});

test("an enum without dark is a variant issue without a value, the section still applies", () => {
  const state = loadSettings(
    setVariant(createEditorState(noDarkDesign), "dark"),
    '{"s": {"w": 9}}',
    "s",
  );
  const result = effectiveDesign(state);
  expect(result.issues.map((issue) => issue.source)).toEqual(["variant"]);
  expect(result.issues[0]?.message).toMatch(/^variant \/theme: /u);
  expect(result.issues[0]?.message).not.toContain('"dark"');
  expect(layerProps(result.design)).toEqual({ w: 9 });
});
