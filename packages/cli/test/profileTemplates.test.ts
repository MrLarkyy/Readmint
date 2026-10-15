import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSvg } from "@readmint/golden/node";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates } from "../../components/src/index.js";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { loadDesignAssets, loadDesignFile } from "../src/index.js";

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
      join(components, "test", "golden", `profiles-${template}`, `${section}-${theme}.svg`),
      "utf8",
    );
    expect(normalizeSvg(svg)).toBe(golden);
  });
});
