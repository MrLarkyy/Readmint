import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDesignAsync, stringifyDesignYamlAsync, validateDesign } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { libraryTemplates } from "../src/index.js";
import { librarySources, loadLibraries } from "./librariesDesigns.js";
import {
  emptyRegistryData,
  longRegistryData,
  missingRegistryData,
  sampleRegistryData,
} from "./sampleRegistryData.js";
import { renderTemplate, withRootProps } from "./templateDesigns.js";

const templates = join(import.meta.dirname, "..", "templates");

/** UTF-8 bytes a library template may take on the longest data (docs/components.md): the starter budget. */
const sizeBudget = 524_288;

const halvedLimits = {
  maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
  maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
};

const utf8Bytes = (svg: string) => new TextEncoder().encode(svg).length;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe.each(libraryTemplates)("%s", (name) => {
  test("validates with no issues", () => {
    expect(validateDesign(JSON.parse(librarySources[name]))).toMatchObject({ ok: true });
  });

  test("has a transparent canvas and a theme enum on its one root instance", () => {
    const design = loadLibraries(name);
    expect(design.canvas.background).toBeUndefined();
    expect(design.layers).toHaveLength(1);
    const [root] = design.layers;
    if (root?.type !== "component") throw new Error("the root layer is not a component");
    expect(root.props).toEqual({ theme: "light" });
    expect(design.components?.[root.ref]?.props?.["theme"]).toEqual({
      type: "enum",
      values: ["light", "dark"],
      default: "light",
    });
  });

  test("names only fonts of templates/fonts, embeddable under a licence kept beside them", () => {
    const readme = readFileSync(join(templates, "fonts", "README.md"), "utf8");
    const fonts = Object.entries(loadLibraries(name).assets?.fonts ?? {});
    expect(fonts.length).toBeGreaterThan(0);
    for (const [id, font] of fonts) {
      expect(font.src, id).toMatch(/^fonts\/[A-Za-z0-9-]+\.ttf$/u);
      expect(font.licence, id).toEqual({ embedding: "allowed", name: "OFL-1.1" });
      expect(existsSync(join(templates, font.src)), id).toBe(true);
      expect(readme, id).toContain(sha256(readFileSync(join(templates, font.src))));
    }
  });

  test.each(["light", "dark"] as const)(
    "renders the sample in the %s theme, the same bytes twice",
    (theme) => {
      const render = () =>
        renderTemplate({
          design: withRootProps(loadLibraries(name), { theme }),
          data: sampleRegistryData(),
        });
      const svg = render();
      expect(render()).toBe(svg);
      expect(svg).toContain(theme === "dark" ? "#0d1117" : "#ffffff");
      expect(svg).not.toContain(theme === "dark" ? "#ffffff" : "#0d1117");
    },
  );

  test("the SVG has no script, no event attribute and only data: references", () => {
    const hostile = '<script>alert(1)</script>&"';
    const data = {
      registry: {
        version: 0 as const,
        npm: [{ name: hostile, version: "<img onerror=x>", weeklyDownloads: 1 }],
        maven: [
          {
            group: "<a href=x onclick=y>",
            artifact: hostile,
            latestVersion: hostile,
            updated: "x",
          },
        ],
      },
    };
    const svg = renderTemplate({ design: loadLibraries(name), data });
    expect(svg).not.toMatch(/<script|<image|<foreignObject|<[^>]*\son[a-z]+=/iu);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
      /https?:|file:|@import/iu,
    );
    for (const [, target] of svg.matchAll(/href="([^"]*)"/gu)) {
      expect(target).toMatch(/^data:/u);
    }
  });

  test("stays within the budget and half the work limits on 20 + 20 of the longest entries", () => {
    const svg = renderTemplate({
      design: loadLibraries(name),
      data: longRegistryData(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(sizeBudget);
  });

  test("an unknown theme is an enum issue at the prop", () => {
    const result = validateDesign(withRootProps(loadLibraries(name), { theme: "sepia" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: "/layers/0/props/theme", code: "enum" }),
      );
    }
  });

  test("re-imports from its YAML export to a deep-equal design", async () => {
    const design = loadLibraries(name);
    const yaml = await stringifyDesignYamlAsync(design);
    if (!yaml.ok) throw new Error(JSON.stringify(yaml.issues));
    expect(await parseDesignAsync(yaml.value, { format: "yaml" })).toEqual({
      ok: true,
      value: design,
    });
  });

  test("its description is for a reader of the image, not the author", () => {
    const description = loadLibraries(name).description ?? "";
    expect(description).not.toMatch(/theme|prop|assets|src|licence/u);
    expect(description.length).toBeGreaterThan(20);
  });
});

test("the sample shows versions, compact downloads and the publication date", () => {
  const svg = renderTemplate({
    design: loadLibraries("libraries-card"),
    data: sampleRegistryData(),
  });
  for (const text of [
    "react",
    "19.1.0",
    "31.5M",
    "98M",
    "@types/node",
    "org.jetbrains.kotlin:kotlin-stdlib",
    "2.1.20",
    "Updated 2025-03-26",
    "junit:junit",
    "Updated 2020-12-15",
  ]) {
    expect(svg).toContain(text);
  }
  expect(svg).not.toContain("No npm packages.");
  expect(svg).not.toContain("No Maven artifacts.");
});

test("null entries are not drawn and the next ones take their place", () => {
  const svg = renderTemplate({
    design: loadLibraries("libraries-card"),
    data: missingRegistryData(),
  });
  expect(svg).toContain("react");
  expect(svg).toContain("brand-new-package");
  expect(svg).toContain("junit:junit");
  expect(svg).not.toContain("null");
  expect(svg).not.toContain("No npm packages.");
});

test("a package without a download figure shows a dash instead of a number", () => {
  const svg = renderTemplate({
    design: loadLibraries("libraries-card"),
    data: {
      registry: {
        version: 0,
        npm: [{ name: "brand-new-package", version: "0.0.1", weeklyDownloads: null }],
        maven: [],
      },
    },
  });
  expect(svg).toContain("brand-new-package");
  expect(svg).not.toContain("-1");
});

test("the card shows the first five packages and three artifacts", () => {
  const svg = renderTemplate({
    design: loadLibraries("libraries-card"),
    data: longRegistryData(),
  });
  expect(svg.match(/9,007\.2T/gu)).toHaveLength(5);
  expect(svg.match(/Updated 2026-10-17/gu)).toHaveLength(3);
});

test("empty data shows the empty states", () => {
  const svg = renderTemplate({
    design: loadLibraries("libraries-card"),
    data: emptyRegistryData(),
  });
  expect(svg).toContain("No npm packages.");
  expect(svg).toContain("No Maven artifacts.");
});
