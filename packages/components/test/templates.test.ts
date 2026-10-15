import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateDesign } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates, starterTemplates } from "../src/index.js";
import { loadTemplate } from "./calendarDesigns.js";
import { sampleGitHubData, sparseGitHubData, worstCaseGitHubData } from "./sampleGitHubData.js";
import { loadStarter, renderTemplate, starterSources, withRootProps } from "./templateDesigns.js";

const packages = join(import.meta.dirname, "..", "..");
const templates = join(import.meta.dirname, "..", "templates");

/** UTF-8 bytes one starter may take on the worst-case data (docs/components.md). */
const starterSizeBudget = 524_288;

/** Half the default work limits: a template must leave room for the rest of a README design. */
const halvedLimits = {
  maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
  maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
};

const utf8Bytes = (svg: string) => new TextEncoder().encode(svg).length;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const themes = ["light", "dark"] as const;

describe.each(starterTemplates)("%s", (name) => {
  test("validates with no issues", () => {
    expect(validateDesign(JSON.parse(starterSources[name]))).toMatchObject({ ok: true });
  });

  test("has a transparent canvas and a theme enum on its one root instance", () => {
    const design = loadStarter(name);
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
    const fonts = Object.entries(loadStarter(name).assets?.fonts ?? {});
    expect(fonts.length).toBeGreaterThan(0);
    for (const [id, font] of fonts) {
      expect(font.src, id).toMatch(/^fonts\/[A-Za-z0-9-]+\.ttf$/u);
      expect(font.licence, id).toEqual({ embedding: "allowed", name: "OFL-1.1" });
      const file = join(templates, font.src);
      expect(existsSync(file), id).toBe(true);
      expect(readme, id).toContain(sha256(readFileSync(file)));
    }
    expect(existsSync(join(templates, "fonts", "OFL.txt"))).toBe(true);
  });

  test.each(themes)("renders the sample in the %s theme, the same bytes twice", (theme) => {
    const data = sampleGitHubData();
    const render = () =>
      renderTemplate({ design: withRootProps(loadStarter(name), { theme }), data });
    const svg = render();
    expect(render()).toBe(svg);
    expect(svg).toContain(theme === "dark" ? "#0d1117" : "#ffffff");
    expect(svg).not.toContain(theme === "dark" ? "#ffffff" : "#0d1117");
  });

  test("the SVG has no script, no event attribute and only data: references", () => {
    const data = sampleGitHubData();
    data.github = { ...data.github, name: '<script>alert(1)</script>&"', bio: "<img onerror=x>" };
    const svg = renderTemplate({ design: loadStarter(name), data });
    expect(svg).not.toMatch(/<script|<image|<foreignObject|<[^>]*\son[a-z]+=/iu);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
      /https?:|file:|@import/iu,
    );
    for (const [, target] of svg.matchAll(/href="([^"]*)"/gu)) {
      expect(target).toMatch(/^data:/u);
    }
    for (const [, target] of svg.matchAll(/url\(([^)]*)\)/gu)) {
      expect(target).toMatch(/^(#|data:)/u);
    }
  });

  test("renders null name and bio, no languages and no streaks", () => {
    expect(() =>
      renderTemplate({ design: loadStarter(name), data: sparseGitHubData() }),
    ).not.toThrow();
  });

  test("stays within the budget and half the work limits on the worst-case data", () => {
    const svg = renderTemplate({
      design: loadStarter(name),
      data: worstCaseGitHubData(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(starterSizeBudget);
  });

  test("an unknown theme is an enum issue at the prop", () => {
    const design = withRootProps(loadStarter(name), { theme: "sepia" });
    const result = validateDesign(design);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: "/layers/0/props/theme", code: "enum" }),
      );
    }
  });
});

test("the language rows show the top six, the sparse account shows the empty state", () => {
  const rows = (svg: string) => svg.match(/<rect [^>]*height="8"/gu)?.length ?? 0;
  const design = loadStarter("language-bars");
  const sample = renderTemplate({ design, data: sampleGitHubData() });
  const sparse = renderTemplate({ design, data: sparseGitHubData() });
  expect(rows(sample)).toBe(12);
  expect(sample).not.toContain("No language data yet.");
  expect(rows(sparse)).toBe(0);
  expect(sparse).toContain("No language data yet.");
});

test.each(["banner", "stats-card", "profile-card"] as const)(
  "%s falls back to the login for an empty or missing name",
  (name) => {
    const { github } = sparseGitHubData();
    const login = { github: { ...github, login: "octocat" } };
    for (const empty of ["", null]) {
      const svg = renderTemplate({
        design: loadStarter(name),
        data: { github: { ...login.github, name: empty } },
      });
      expect(svg).toContain("octocat");
    }
  },
);

test("a streak of zero days shows 'No streak' instead of its length and dates", () => {
  const design = loadStarter("profile-card");
  expect(renderTemplate({ design, data: sparseGitHubData() })).toContain("No streak");
  expect(renderTemplate({ design, data: sampleGitHubData() })).not.toContain("No streak");
});

test("a streak of one day reads '1 day'", () => {
  const { github } = sampleGitHubData();
  const one = { length: 1, start: "2026-01-02", end: "2026-01-02" };
  const svg = renderTemplate({
    design: loadStarter("profile-card"),
    data: {
      github: {
        ...github,
        contributions: { ...github.contributions, streaks: { current: one, longest: one } },
      },
    },
  });
  expect(svg).toContain(">1 day<");
  expect(svg).not.toContain("1 days");
});

test("the description of every starter is for a reader of the image, not the author", () => {
  for (const name of starterTemplates) {
    const description = loadStarter(name).description ?? "";
    expect(description, name).not.toMatch(/theme|prop|assets|src|licence/u);
    expect(description.length, name).toBeGreaterThan(20);
  }
});

describe("the renderer has no special case for a template", () => {
  const names = [
    ...starterTemplates,
    ...Object.keys(profileTemplates),
    "calendar-",
    "profiles/",
    "@readmint/components",
  ];

  function sources(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  test.each(["renderer", "format"])("packages/%s/src names no template or component", (name) => {
    const files = sources(join(packages, name, "src"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const word of names) expect(source, `${file} mentions ${word}`).not.toContain(word);
    }
  });

  test("the renderer does not depend on the components package", () => {
    const manifest = readFileSync(join(packages, "renderer", "package.json"), "utf8");
    expect(manifest).not.toContain("@readmint/components");
  });
});

describe("the calendar is the RM-17 one", () => {
  test.each(["isometric-card", "profile-card"] as const)(
    "%s carries the calendar of calendar-heatmap and the cell of calendar-isometric",
    (name) => {
      const components = loadStarter(name).components;
      expect(components?.["calendar"]).toEqual(
        loadTemplate("calendar-heatmap").components?.["calendar"],
      );
      expect(components?.["cell"]).toEqual(loadTemplate("calendar-isometric").components?.["cell"]);
    },
  );
});
