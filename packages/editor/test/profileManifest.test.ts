import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileSection } from "../../components/src/index.js";
import { profileFile, profileFontFiles, profileRenders, profileSource } from "./profileFiles.js";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { stripFontData } from "../../components/test/stripFontData.js";
import {
  attachAsset,
  chooseRender,
  createEditorState,
  effectiveDesign,
  importDesign,
  loadFixture,
  loadManifest,
  loadSettings,
  renderPreview,
  setVariant,
  type EditorState,
} from "../src/index.js";

const components = join(import.meta.dirname, "..", "..", "components");
const folders = join(components, "templates", "profiles");
const templates = Object.keys(profileTemplates) as (keyof typeof profileTemplates)[];

const golden = (template: string, name: string, theme: "light" | "dark") =>
  readFileSync(
    join(components, "test", "golden", `profiles-${template}-svg`, `${name}-${theme}.svg`),
    "utf8",
  );

async function open(
  template: (typeof templates)[number],
  section: ProfileSection,
  withSettings: boolean,
): Promise<EditorState> {
  const imported = await importDesign(profileSource(template, section));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  let state = createEditorState(imported.value);
  const files = profileFontFiles(template);
  for (const [id, font] of Object.entries(imported.value.assets?.fonts ?? {})) {
    const bytes = files[font.src];
    if (bytes === undefined) throw new Error(`no font ${font.src}`);
    state = attachAsset(state, "fonts", id, bytes);
    expect(state.issues).toEqual([]);
  }
  state = loadFixture(state, JSON.stringify(sampleProfileData()));
  state = loadManifest(state, readFileSync(join(folders, template, "renders.json"), "utf8"));
  expect(state.issues).toEqual([]);
  if (withSettings) {
    state = loadSettings(state, readFileSync(join(folders, template, "settings.json"), "utf8"));
    expect(state.issues).toEqual([]);
  }
  return state;
}

function svgOf(state: EditorState): string {
  const effective = effectiveDesign(state);
  expect(effective.issues).toEqual([]);
  const result = renderPreview({
    design: effective.design,
    data: state.data,
    sessionAssets: state.sessionAssets,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return stripFontData(result.svg);
}

describe.each(templates)("%s manifest renders in the editor", (template) => {
  test.each(profileRenders(template).map((entry) => entry.name))(
    "%s equals its golden, light and dark",
    async (name) => {
      const section = name as ProfileSection;
      const file = profileFile(template, section);
      const state = await open(template, section, false);
      const chosen = chooseRender(state, name, file);
      expect(chosen.issues).toEqual([]);
      expect(chosen.manifest?.render).toBe(name);
      expect(svgOf(chosen), name).toBe(golden(template, name, "light"));
      const dark = setVariant(chosen, "dark");
      expect(dark.issues).toEqual([]);
      expect(svgOf(dark), `${name} dark`).toBe(golden(template, name, "dark"));
    },
    60_000,
  );

  test("with the template's settings the section is the render's name when the file has it", async () => {
    const settings = JSON.parse(
      readFileSync(join(folders, template, "settings.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const entry of profileRenders(template)) {
      const section = entry.name as ProfileSection;
      const state = await open(template, section, true);
      const chosen = chooseRender(state, entry.name, profileFile(template, section));
      expect(chosen.settings?.section, entry.name).toBe(
        Object.hasOwn(settings, entry.name) ? entry.name : undefined,
      );
    }
  }, 60_000);
});
