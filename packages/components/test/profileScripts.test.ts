import { renderSvg, RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileTemplate } from "../src/index.js";
import {
  loadExampleProfile,
  loadProfile,
  profileFontAssets,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import {
  repositoryTextsProfileData,
  sampleProfileData,
  worstCaseScriptsProfileData,
  type ProfileData,
} from "./sampleProfileData.js";

const themes: readonly ProfileTheme[] = ["light", "dark"];
const names = Object.keys(profileTemplates) as ProfileTemplate[];

const cyrillicName = "Привет-мир";
const greekDescription = "Ωμέγα: κάρτες προφίλ";

function render(
  template: ProfileTemplate,
  section: string,
  theme: ProfileTheme,
  data: ProfileData,
  layerBoxes = false,
) {
  const design = loadExampleProfile(template, section as never, theme);
  const result = renderSvg(design, {
    data,
    assets: { fonts: profileFontAssets(template, design) },
    layerBoxes,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** The code points a `missing-glyph` warning names, as "U+XXXX". */
function missing(warnings: readonly { code: string; message: string }[]): string[] {
  return warnings
    .filter((warning) => warning.code === "missing-glyph")
    .flatMap((warning) => [...warning.message.matchAll(/U\+[0-9A-F]{4,6}/gu)].map(([hit]) => hit));
}

/** The family a font's fallback must be: Archivo and Geist draw Noto Sans, Geist Mono draws Noto Sans Mono. */
function fallbackFamily(family: string): string | undefined {
  if (family === "Geist Mono") return "Noto Sans Mono";
  return family.startsWith("Archivo") || family === "Geist" ? "Noto Sans" : undefined;
}

describe.each(names)("%s names a Noto fallback for every Archivo and Geist font", (template) => {
  const cases = profileTemplates[template].flatMap((section) =>
    themes.map((theme) => [section, theme] as const),
  );

  test.each(cases)(
    "%s (%s) draws Cyrillic, Greek and Latin Extended-A from the fallback of each font",
    (section, theme) => {
      const design = loadProfile(template, section, theme);
      const fonts = design.assets?.fonts ?? {};
      const covered = Object.entries(fonts).filter(
        ([, font]) => fallbackFamily(font.family) !== undefined,
      );
      expect(covered.length).toBeGreaterThan(0);
      for (const [id, font] of covered) {
        const [fallbackId] = font.fallback ?? [];
        expect(fallbackId, `${id} has a fallback`).toBeDefined();
        const fallback = fonts[String(fallbackId)];
        expect(fallback?.family, id).toBe(fallbackFamily(font.family));
        expect(fallback?.weight, id).toBe(font.weight);
      }
      const probe = renderSvg(
        {
          version: 0,
          canvas: { width: 400, height: 40 * covered.length },
          assets: { fonts },
          layers: covered.map(([id], index) => ({
            type: "text" as const,
            y: index * 40,
            content: "ΑΒΓαβγΩμέγα ĔĳŉſПривет",
            font: id,
            fontSize: 20,
          })),
        },
        { assets: { fonts: profileFontAssets(template, design) } },
      );
      expect(probe.ok).toBe(true);
      if (probe.ok) expect(probe.warnings).toEqual([]);
    },
  );
});

describe.each(names)("%s with a Cyrillic repository name and a Greek description", (template) => {
  test.each(themes)("%s: Cyrillic and Greek are both drawn with no warning", (theme) => {
    const result = render(
      template,
      "repo-1",
      theme,
      repositoryTextsProfileData(cyrillicName, greekDescription),
    );
    expect(result.warnings).toEqual([]);
  });

  test("the CJK name still warns missing-glyph and names only CJK code points", () => {
    const result = render(
      template,
      "repo-1",
      "light",
      repositoryTextsProfileData("日本語-repo", "plain description"),
    );
    const lacking = missing(result.warnings);
    expect(lacking.length).toBeGreaterThan(0);
    for (const point of lacking) {
      expect(Number.parseInt(point.slice(2), 16), point).toBeGreaterThanOrEqual(0x4e00);
    }
  });
});

describe("the pinscreen repository line follows the drawn width of the name", () => {
  /** x of the first glyph of the text `content` in the SVG: the per-glyph x list of its tspan. */
  function xOf(svg: string, content: string): number {
    const hit = new RegExp(`<tspan[^>]* x="([^" ]+)[^"]*"[^>]*>${content}</tspan>`, "u").exec(svg);
    if (hit === null) throw new Error(`no text ${content}`);
    return Number(hit[1]);
  }

  test.each(themes)(
    "%s: ASCII names keep the column positions, CJK takes no extra room",
    (theme) => {
      const ascii = render(
        "pinscreen",
        "repo-1",
        theme,
        repositoryTextsProfileData("abcdefgh", "d"),
      );
      const eight = Number((40 + (8 + 8) * 6.9).toFixed(3));
      expect(xOf(ascii.svg, ":")).toBeCloseTo(eight, 2);
      const cjk = render(
        "pinscreen",
        "repo-1",
        theme,
        repositoryTextsProfileData("日本語-repo", "d"),
      );
      // three characters are not drawn: the line starts after "-repo", five columns of the monospaced font
      expect(xOf(cjk.svg, ":")).toBeCloseTo(40 + 8 * 6.9 + 5 * 6.9, 2);
    },
  );
});

describe("a Greek repository name in pinscreen", () => {
  test.each(themes)("%s: keeps the 0.6 em column of the code grid", (theme) => {
    const greek = render(
      "pinscreen",
      "repo-1",
      theme,
      repositoryTextsProfileData("Ωμέγα-greek", "d"),
    );
    expect(greek.warnings).toEqual([]);
    const hit = /<tspan[^>]* x="([^" ]+)[^"]*"[^>]*>:<\/tspan>/u.exec(greek.svg);
    expect(Number(hit?.[1])).toBeCloseTo(40 + 8 * 6.9 + 11 * 6.9, 2);
  });
});

describe("Cyrillic and Greek names stay inside their boxes", () => {
  const data = sampleProfileData();
  const cycle = (length: number) => "Привет мир Ωμέγα ".repeat(60).slice(0, length);

  test("the horizon header sizes a Cyrillic name by its drawn width", () => {
    const github = { ...data.github, name: cycle(40) };
    const result = render("horizon", "header", "light", { github }, true);
    expect(result.warnings).toEqual([]);
    const name = result.layerBoxes?.find(
      (box) => box.y === 0 && box.height > 100 && box.height < 200 && box.width <= 840.01,
    );
    expect(name?.width ?? 0).toBeGreaterThan(780);
  });

  const longTexts = () => {
    const repositories = data.github.repositories.map((repository, index) => ({
      ...repository,
      name: cycle(40 + index),
      description: cycle(300),
    }));
    return {
      github: {
        ...data.github,
        repositories,
        pinned: repositories,
        pushes: data.github.pushes.map((push) => ({
          ...push,
          repository: cycle(40),
          message: cycle(200),
        })),
      },
    };
  };

  test.each(themes)(
    "%s: year ring recent rows cut the name inside 188 and the message inside 636",
    (theme) => {
      const boxes = render("year-ring", "recent", theme, longTexts(), true).layerBoxes ?? [];
      const names = boxes.filter((box) => box.x === 100 && Math.round(box.height) === 17);
      const messages = boxes.filter((box) => box.x === 196 && Math.round(box.height) === 17);
      expect(names.length).toBeGreaterThanOrEqual(4);
      expect(messages.length).toBeGreaterThanOrEqual(4);
      for (const box of names) expect(box.x + box.width).toBeLessThanOrEqual(188.01);
      for (const box of messages) expect(box.x + box.width).toBeLessThanOrEqual(636.01);
    },
  );

  test.each(themes)(
    "%s: year ring repo-1 cuts the name inside 300 and the description inside 400",
    (theme) => {
      const result = render("year-ring", "repo-1", theme, longTexts(), true);
      expect(result.warnings).toEqual([]);
      const boxes = result.layerBoxes ?? [];
      const name = boxes.find(
        (box) => box.x === 0 && Math.round(box.y) === 0 && Math.round(box.height) === 35,
      );
      const description = boxes.find(
        (box) => box.x === 0 && Math.round(box.y) === 62 && Math.round(box.height) === 38,
      );
      expect(name?.width ?? Number.NaN).toBeLessThanOrEqual(300.01);
      expect(name?.width ?? 0).toBeGreaterThan(200);
      expect(description?.width ?? Number.NaN).toBeLessThanOrEqual(400.01);
    },
  );
});

describe("Cyrillic and Greek texts of 1024 characters (RM-128, RM-154)", () => {
  const sizeBudget = 524_288;
  const halved = {
    maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
    maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
  };
  const orders = ["cyrillic-first", "greek-first"] as const;
  const cases = names.flatMap((template) =>
    profileTemplates[template].flatMap((section) =>
      orders.map((order) => [template, section, order] as const),
    ),
  );

  test.each(cases)(
    "%s %s (%s cycle) draws every letter with no warning, within 512 KiB and half the work limits",
    (template, section, order) => {
      const svg = renderProfile({
        template,
        design: loadProfile(template, section),
        data: worstCaseScriptsProfileData(order),
        limits: halved,
      });
      expect(new TextEncoder().encode(svg).length).toBeLessThanOrEqual(sizeBudget);
    },
  );
});
