import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSvg } from "@readmint/golden/node";
import { renderSvg } from "@readmint/renderer";
import { expect, test } from "vitest";
import { sampleGitHubData } from "../../components/test/sampleGitHubData.js";
import { loadDesignAssets, loadDesignFile } from "../src/index.js";

// The templates of @readmint/components are read from disk as a user does, without the package depending on it.
const components = join(import.meta.dirname, "..", "..", "components");
const templates = join(components, "templates");

const starters = readdirSync(templates).filter(
  (file) => file.endsWith(".design.json") && !file.startsWith("calendar-"),
);

test("the folder holds the starter templates", () => {
  expect(starters).toHaveLength(5);
});

// The golden render passes the font bytes itself; the CLI path resolves the relative `src` and must give the same SVG.
test.each(starters)("%s renders from disk as its light golden", async (file) => {
  const design = await loadDesignFile(file, { cwd: templates });
  const assets = await loadDesignAssets(design);
  expect(Object.keys(assets.fonts ?? {}).sort()).toEqual(
    Object.keys(design.design.assets?.fonts ?? {}).sort(),
  );
  const result = renderSvg(design.design, { data: sampleGitHubData(), assets });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  expect(result.warnings).toEqual([]);
  const golden = readFileSync(
    join(
      components,
      "test",
      "golden",
      "templates",
      `${file.replace(".design.json", "")}-light.svg`,
    ),
    "utf8",
  );
  expect(normalizeSvg(result.svg)).toBe(golden);
});
