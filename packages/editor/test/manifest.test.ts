import { describe, expect, test } from "vitest";
import {
  chooseRender,
  createEditorState,
  createHistory,
  EditorLimits,
  effectiveDesign,
  loadManifest,
  loadSettings,
  recordEdit,
  redo,
  setSettingsProp,
  setVariant,
  settingsFields,
  undo,
  type EditorState,
} from "../src/index.js";
import { RenderManifestLimits } from "@readmint/format";
import { manifestDesign, manifestSettingsText, manifestText } from "./settingsDesign.js";

const base = createEditorState(manifestDesign);
const loaded = loadManifest(base, manifestText);

function rootProps(state: EditorState): Record<string, unknown> {
  const layer = effectiveDesign(state).design.layers[0];
  return layer?.type === "component" ? { ...layer.props } : {};
}

describe("loadManifest", () => {
  test("keeps the renders and no render, as a session input", () => {
    expect(loaded.issues).toEqual([]);
    expect(loaded.manifest?.renders.map((entry) => entry.name)).toEqual([
      "card-a",
      "card-b",
      "plain",
      "themed",
      "other",
    ]);
    expect(loaded.manifest?.render).toBeUndefined();
    expect(loaded.design).toBe(base.design);
  });

  test("refuses a bad manifest without a value in its message and leaves the state", () => {
    const text = JSON.stringify({
      renders: [{ name: "a", design: "card.json", props: { slot: "s3cret-value" }, extra: 1 }],
    });
    const next = loadManifest(loaded, text);
    expect(next.manifest).toBe(loaded.manifest);
    expect(next.issues.length).toBeGreaterThan(0);
    expect(next.issues.every((issue) => issue.source === "manifest")).toBe(true);
    expect(JSON.stringify(next.issues)).not.toContain("s3cret-value");
    expect(loadManifest(loaded, "{not json").issues[0]?.source).toBe("manifest");
  });

  test("refuses text over the cap, state unchanged", () => {
    const big = "x".repeat(EditorLimits.maxManifestBytes + 1);
    const next = loadManifest(loaded, big);
    expect(next.manifest).toBe(loaded.manifest);
    expect(next.issues[0]?.message).toMatch(/larger than/u);
  });

  test("keeps the chosen render when the new manifest has it for this design file, else none", () => {
    const chosen = chooseRender(loaded, "card-a", "card.json");
    expect(loadManifest(chosen, manifestText, "card.json").manifest?.render).toBe("card-a");
    const without = JSON.stringify({ renders: [{ name: "x", design: "card.json" }] });
    expect(loadManifest(chosen, without, "card.json").manifest?.render).toBeUndefined();
  });

  test("a reload applies the rules of choosing the render", () => {
    const text = (entry: object) =>
      JSON.stringify({ renders: [{ name: "b", design: "card.json", ...entry }] });
    const chosen = setVariant(chooseRender(loadManifest(base, text({})), "b", "card.json"), "dark");
    expect(chosen.variant?.name).toBe("dark");
    // The render now lists no variants: Dark goes.
    const empty = loadManifest(chosen, text({ variants: [] }), "card.json");
    expect(empty.manifest?.render).toBe("b");
    expect(empty.variant).toBeUndefined();
    // The render now names another design file: it is no longer chosen.
    const moved = loadManifest(chosen, text({ design: "other.json" }), "card.json");
    expect(moved.manifest?.render).toBeUndefined();
    expect(rootProps(moved)).toEqual({ theme: "dark" });
    // Without the render the section is the file's own, as choosing none.
    const settings = loadSettings(
      chooseRender(loaded, "card-a", "card.json"),
      manifestSettingsText,
    );
    const section = chooseRender(settings, "card-a", "card.json");
    expect(section.settings?.section).toBe("card-a");
    const gone = loadManifest(section, text({}), "card.json");
    expect(gone.manifest?.render).toBeUndefined();
    expect(gone.settings?.section).toBe("card");
    expect(rootProps(gone)).toEqual({ slot: 4 });
  });

  test("a BOM and the longest source the format takes load, as in the CLI", () => {
    const pad = " ".repeat(RenderManifestLimits.maxSourceLength - manifestText.length);
    const next = loadManifest(base, "﻿" + manifestText + pad);
    expect(next.issues).toEqual([]);
    expect(next.manifest?.renders).toHaveLength(5);
  });
});

describe("chooseRender", () => {
  test("refuses without a manifest, an unknown render and another design file's render", () => {
    expect(chooseRender(base, "card-a", "card.json").issues[0]?.message).toBe(
      "no manifest is loaded",
    );
    const unknown = chooseRender(loaded, "x".repeat(500), "card.json");
    expect(unknown.manifest).toBe(loaded.manifest);
    expect(unknown.issues[0]?.message).toBe(`the manifest has no render "${"x".repeat(64)}"`);
    const other = chooseRender(loaded, "other", "card.json");
    expect(other.manifest?.render).toBeUndefined();
    expect(other.issues[0]).toMatchObject({
      source: "manifest",
      message: 'render "other" renders design file "other.json"; import it first',
    });
    expect(chooseRender(loaded, "card-a", undefined).issues).toHaveLength(1);
  });

  test("the render's props are applied before the settings and its name picks the section", () => {
    const withSettings = loadSettings(loaded, manifestSettingsText);
    const chosen = chooseRender(withSettings, "card-a", "card.json");
    expect(chosen.issues).toEqual([]);
    expect(chosen.settings?.section).toBe("card-a");
    expect(rootProps(chosen)).toEqual({ slot: 3 });
    const noSection = chooseRender(withSettings, "themed", "card.json");
    expect(noSection.settings?.section).toBeUndefined();
    expect(rootProps(noSection)).toEqual({ theme: "dark" });
    const plain = chooseRender(loaded, "card-b", "card.json");
    expect(rootProps(plain)).toEqual({ slot: 2 });
  });

  test("a section prop overriding the render's props is a warning, not an error", () => {
    const chosen = chooseRender(loadSettings(loaded, manifestSettingsText), "card-a", "card.json");
    const warnings = effectiveDesign(chosen).warnings.map((warning) => warning.message);
    expect(warnings).toContain(
      'settings /card-a/slot: the section sets it, which overrides the props of render "card-a"',
    );
  });

  test("choosing none returns to the design file's own section", () => {
    const settings = loadSettings(loaded, manifestSettingsText);
    const chosen = chooseRender(settings, "card-a", "card.json");
    const back = chooseRender(chosen, undefined, "card.json");
    expect(back.manifest?.render).toBeUndefined();
    expect(back.settings?.section).toBe("card");
    expect(rootProps(back)).toEqual({ slot: 4 });
  });

  test("drops a variant the render does not list, keeps a listed one", () => {
    const dark = setVariant(loaded, "dark");
    expect(chooseRender(dark, "plain", "card.json").variant).toBeUndefined();
    expect(chooseRender(dark, "card-a", "card.json").variant?.name).toBe("dark");
    expect(chooseRender(dark, "card-b", "card.json").variant?.name).toBe("dark");
  });

  test("a render the design cannot take shows an issue naming the pointer, never the value", () => {
    const text = JSON.stringify({
      renders: [{ name: "bad", design: "card.json", props: { slot: "s3cret-value" } }],
    });
    const chosen = chooseRender(loadManifest(base, text), "bad", "card.json");
    const effective = effectiveDesign(chosen);
    expect(effective.issues).toHaveLength(1);
    expect(effective.issues[0]?.source).toBe("manifest");
    expect(effective.issues[0]?.message).toMatch(/^render "bad" \/renders\/0\/props\/slot: /u);
    expect(JSON.stringify(effective.issues)).not.toContain("s3cret-value");
    expect(effective.design).toBe(base.design);
  });
});

describe("variants of a render", () => {
  test("setVariant refuses one the render does not list", () => {
    const empty = chooseRender(loaded, "plain", "card.json");
    expect(setVariant(empty, "dark").issues[0]).toMatchObject({
      source: "variant",
      message: 'render "plain" lists no dark variant',
    });
    const listed = chooseRender(loaded, "card-a", "card.json");
    expect(setVariant(listed, "dark").variant?.name).toBe("dark");
    expect(setVariant(chooseRender(loaded, "card-b", "card.json"), "dark").variant?.name).toBe(
      "dark",
    );
  });

  test("a run variant that sets a prop of a render without variants is a manifest issue, left out", () => {
    const themed = chooseRender(loaded, "themed", "card.json");
    const dark = setVariant(themed, "dark");
    expect(dark.variant?.name).toBe("dark");
    const effective = effectiveDesign(dark);
    expect(effective.issues).toEqual([
      {
        source: "manifest",
        message:
          "manifest /renders/3/props/theme: the prop theme is also set by the dark variant; set it in one place",
        path: "/renders/3/props/theme",
      },
    ]);
    expect(rootProps(dark)).toEqual({ theme: "dark" });
  });
});

describe("the form", () => {
  test("a render whose props do not apply shows no value from it", () => {
    const text = JSON.stringify({
      renders: [{ name: "bad", design: "card.json", props: { slot: "abc" } }],
    });
    const settings = loadSettings(loadManifest(base, text), JSON.stringify({ bad: {} }));
    const chosen = chooseRender(settings, "bad", "card.json");
    expect(chosen.settings?.section).toBe("bad");
    expect(settingsFields(chosen).fields.find((field) => field.name === "slot")).toMatchObject({
      value: 0,
      from: "default",
    });
  });

  test("shows a render prop the section lacks as coming from the render", () => {
    const settings = loadSettings(loaded, manifestSettingsText);
    const chosen = chooseRender(settings, "card-b", "card.json");
    const fields = settingsFields(chosen).fields;
    expect(fields.find((field) => field.name === "slot")).toMatchObject({
      value: 2,
      from: "render",
    });
    expect(fields.find((field) => field.name === "theme")?.from).toBe("default");
    const edited = setSettingsProp(chosen, "slot", 7);
    expect(settingsFields(edited).fields.find((field) => field.name === "slot")?.from).toBe(
      "settings",
    );
  });
});

describe("a session input", () => {
  test("undo and redo keep the manifest and the render; the design never holds them", () => {
    const chosen = chooseRender(loaded, "card-a", "card.json");
    const edited = { ...chosen, design: { ...chosen.design, canvas: { width: 50, height: 50 } } };
    expect(recordEdit(createHistory(), loaded, chosen)).toEqual(createHistory());
    const history = recordEdit(createHistory(), chosen, edited);
    const back = undo(history, edited);
    expect(back?.state.manifest).toBe(chosen.manifest);
    const forth = back === undefined ? undefined : redo(back.history, back.state);
    expect(forth?.state.manifest).toBe(chosen.manifest);
    expect(JSON.stringify(chosen.design)).not.toContain("card-a");
  });
});
