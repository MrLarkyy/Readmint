import { renderSvg, RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { loadExampleProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import {
  longLanguageNames,
  longLanguageProfileData,
  sampleProfileData,
  type ProfileData,
} from "./sampleProfileData.js";

const themes: readonly ProfileTheme[] = ["light", "dark"];

/** Where the labels may end: the bar starts at 520, the row keeps 8 px of margin (kerning after a cut name). */
const limit = 512;

interface Label {
  readonly text: string;
  readonly right: number;
}

interface Drawn {
  readonly svg: string;
  readonly labels: readonly Label[];
}

/** The Languages row of the index: each drawn label's text and the right edge of its box on the canvas. */
function draw(data: ProfileData, theme: ProfileTheme = "light", limits = {}, locale = "en"): Drawn {
  const design = loadExampleProfile("year-ring", "index", theme);
  const result = renderSvg(design, {
    data,
    assets: { fonts: profileFontAssets("year-ring", design) },
    layerBoxes: true,
    limits,
    locale,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const texts = [...result.svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/gu)]
    .map((match) => match[1] ?? "")
    .filter((text) => /\d+%$/u.test(text));
  const boxes = (result.layerBoxes ?? []).filter(
    (box) =>
      box.y > 106 &&
      box.y < 134 &&
      box.x >= 170 &&
      box.x < 520 &&
      box.height === 18 &&
      box.width > 0,
  );
  expect(boxes.length).toBe(texts.length);
  return {
    svg: result.svg,
    labels: texts.map((text, index) => ({
      text,
      right: (boxes[index]?.x ?? Number.NaN) + (boxes[index]?.width ?? Number.NaN),
    })),
  };
}

const named = (names: readonly string[], shares?: readonly number[]) =>
  longLanguageProfileData(names, shares);

describe("year ring index languages fit left of the bar (RM-125)", () => {
  const cases: readonly (readonly [string, readonly string[], readonly number[] | undefined])[] = [
    ["names GitHub uses", longLanguageNames, undefined],
    ["three names of 20 W", ["W".repeat(20), "W".repeat(20), "W".repeat(20)], undefined],
    ["three names of 20 m", ["m".repeat(20), "m".repeat(20), "m".repeat(20)], undefined],
    [
      "a 34-character Linguist name",
      ["Rich Text Format With Long Name X", "Visual Basic .NET", "Go"],
      undefined,
    ],
    [
      "shares 34, 33, 33",
      ["Jupyter Notebook", "Visual Basic .NET", "Objective-C++"],
      [0.34, 0.33, 0.33],
    ],
    ["a share of 100", ["Jupyter Notebook"], [1]],
    ["two long languages", ["Jupyter Notebook", "Visual Basic .NET"], [0.6, 0.4]],
    ["one 20-character language", ["W".repeat(20)], [1]],
  ];
  for (const [name, names, shares] of cases) {
    for (const theme of themes) {
      test(`${theme}: ${name} end at or left of ${String(limit)} and keep their percentage`, () => {
        const { labels } = draw(named(names, shares), theme);
        expect(labels.length).toBe(Math.min(names.length, 3));
        for (const label of labels) {
          expect(label.right).toBeLessThanOrEqual(limit);
          expect(label.text).toMatch(/ \d+%$/u);
        }
      });
    }
  }

  test("a short name next to two long ones is not cut", () => {
    const { labels } = draw(named(["C", "W".repeat(20), "W".repeat(20)], [0.4, 0.3, 0.3]));
    expect(labels[0]?.text).toBe("C 40%");
    expect(labels[1]?.text).toContain("…");
    expect(labels[2]?.text).toContain("…");
  });

  test("the cut names of the issue's account end with …", () => {
    const { labels } = draw(named(longLanguageNames));
    expect(labels.map((label) => label.text)).toEqual([
      "Jupyter… 40%",
      "Visual … 20%",
      "Objecti… 20%",
    ]);
  });

  test("names that fit are drawn whole, the sample account as before", () => {
    const { labels } = draw(sampleProfileData());
    expect(labels.map((label) => label.text)).toEqual(["Python 25%", "TypeScript 20%", "Go 15%"]);
  });

  test("light and dark place every glyph alike", () => {
    const glyphs = (theme: ProfileTheme) =>
      [
        ...draw(named(longLanguageNames), theme).svg.matchAll(
          /<tspan[^>]* x="([^"]*)" y="([^"]*)"/gu,
        ),
      ].map((match) => [match[1], match[2]]);
    expect(glyphs("dark")).toEqual(glyphs("light"));
  });

  for (const locale of ["de", "fr"]) {
    test(`${locale}: the labels equal the English ones, cut and uncut`, () => {
      const cut = named(longLanguageNames);
      expect(draw(cut, "light", {}, locale).labels).toEqual(draw(cut).labels);
      let widest = 0;
      for (let length = 1; length <= 20; length += 1) {
        const names = ["n".repeat(length), "n".repeat(length), "n".repeat(length)];
        if (draw(named(names)).labels.some((label) => label.text.includes("…"))) break;
        widest = length;
      }
      expect(widest).toBeGreaterThan(1);
      const names = ["n".repeat(widest), "n".repeat(widest), "n".repeat(widest)];
      expect(draw(named(names), "light", {}, locale).labels).toEqual(draw(named(names)).labels);
    });
  }

  test("a share of 99.5 % is measured as drawn (100 %) and stays inside", () => {
    const names = ["W".repeat(20), "W".repeat(20), "W".repeat(20)];
    for (const locale of ["en", "de"]) {
      const { labels } = draw(named(names, [0.995, 0.003, 0.002]), "light", {}, locale);
      expect(labels[0]?.text.endsWith(" 100%")).toBe(true);
      for (const label of labels) expect(label.right).toBeLessThanOrEqual(limit);
    }
  });

  test("the worst case (34-character names) stays within half the work limits", () => {
    const wide = "W".repeat(34);
    const { labels } = draw(named([wide, wide, wide], [0.34, 0.33, 0.33]), "light", {
      maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
      maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
    });
    for (const label of labels) expect(label.right).toBeLessThanOrEqual(limit);
  });
});
