import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates } from "../../components/src/index.js";
import { stripFontData } from "../../components/test/stripFontData.js";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import {
  loadDesignAssets,
  loadDesignFile,
  loadRenderInput,
  renderInput,
  renderVariant,
} from "../src/index.js";

// The profile templates of @readmint/components are read from disk as a user does, without the package depending on it.
const components = join(import.meta.dirname, "..", "..", "components");
const folders = join(components, "templates", "profiles");

const cases = Object.entries(profileTemplates).flatMap(([template, sections]) =>
  sections.flatMap((section) =>
    (["light", "dark"] as const).map((theme) => [template, section, theme] as const),
  ),
);

test("the folders hold the profile templates", () => {
  expect(readdirSync(folders).sort()).toEqual(Object.keys(profileTemplates).sort());
});

// The golden render passes the font bytes itself; the CLI path resolves the relative `src` and must give the same SVG.
describe.each(cases)("%s %s %s", (template, section, theme) => {
  const file = theme === "dark" ? `${section}.dark.json` : `${section}.json`;

  test("renders from disk as its golden, the same bytes twice", async () => {
    const folder = join(folders, template);
    const design = await loadDesignFile(file, { cwd: folder });
    const assets = await loadDesignAssets(design);
    expect(Object.keys(assets.fonts ?? {}).sort()).toEqual(
      Object.keys(design.design.assets?.fonts ?? {}).sort(),
    );
    const render = () => {
      const result = renderSvg(design.design, { data: sampleProfileData(), assets });
      if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
      expect(result.warnings).toEqual([]);
      return result.svg;
    };
    const svg = render();
    expect(render()).toBe(svg);
    const golden = readFileSync(
      join(components, "test", "golden", `profiles-${template}-svg`, `${section}-${theme}.svg`),
      "utf8",
    );
    expect(stripFontData(svg)).toBe(golden);
  });
});

const dark = renderVariant("dark");

// The variant of the light file is the twin that would exist: same bytes, with and without the template's settings.
describe.each(
  Object.entries(profileTemplates).flatMap(([template, sections]) =>
    sections.map((section) => [template, section] as const),
  ),
)("%s %s dark variant", (template, section) => {
  const cwd = join(folders, template);
  const render = async (design: string, options: object, props?: string) => {
    const input = await loadRenderInput(
      { design, ...(props === undefined ? {} : { props }) },
      { cwd, data: sampleProfileData(), ...options },
    );
    const result = renderInput(input, {});
    if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
    return result.svg;
  };

  test("renders its dark golden from the light file", async () => {
    if (dark === undefined) throw new Error("no dark variant");
    const svg = await render(`${section}.json`, { variant: dark });
    const golden = readFileSync(
      join(components, "test", "golden", `profiles-${template}-svg`, `${section}-dark.svg`),
      "utf8",
    );
    expect(stripFontData(svg)).toBe(golden);
  });

  test("equals the twin with the template settings", async () => {
    if (dark === undefined) throw new Error("no dark variant");
    const variant = await render(`${section}.json`, { variant: dark }, "settings.json");
    const twin = await render(`${section}.dark.json`, {}, "settings.json");
    expect(variant).toBe(twin);
  });
});
