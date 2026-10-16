import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { createTextMeasurer } from "../src/createTextMeasurer.js";
import { renderSvg } from "../src/index.js";
import { RenderContext } from "../src/RenderContext.js";
import { fontAssets } from "./testAssets.js";

const rocket = "\u{1F680}";
const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
const star = "\u2605";
const diamond = "\u{1F536}";
const arabic = "\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0644\u0627";

const fonts: Record<string, FontAsset> = {
  m: { ...fontAssets.medium, fallback: ["s"] },
  s: fontAssets.symbols,
  n: fontAssets.naskh,
  x: fontAssets.extraBold,
};

function design(layers: Layer[]): Design {
  return { version: 0, canvas: { width: 400, height: 100 }, assets: { fonts }, layers };
}

/** The drawn box width of a text layer and the width `textWidth` gives the same text, from one render. */
function drawnAndMeasured(text: string, font: string, fontSize: number, letterSpacing = 0) {
  const result = renderSvg(
    design([
      { type: "text", content: "{{ t }}", font, fontSize, letterSpacing },
      {
        type: "rect",
        width: `{{ t | textWidth("${font}", ${String(fontSize)}, ${String(letterSpacing)}) }}`,
        height: 1,
        fill: "#000000",
      },
    ]),
    { data: { t: text }, layerBoxes: true },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const [drawn, measured] = result.layerBoxes ?? [];
  return { drawn: drawn?.width, measured: measured?.width, warnings: result.warnings };
}

function measurer() {
  return createTextMeasurer(new RenderContext(design([]), {}));
}

describe("textWidth is the width a text layer draws", () => {
  test.each([
    ["Latin with kerning", "AVATAR Tov, We'll", "m", 16, 0],
    ["a dropped emoji", `ab${rocket}cd${family}e`, "m", 16, 0],
    ["letter spacing", "Hello world", "m", 16, 1.5],
    ["negative letter spacing", "Hello world", "m", 120, -1.2],
    ["a hard line break: the widest line", "short\nmuch longer line\nmid", "m", 14, 0],
    ["right to left", arabic, "n", 18, 0],
    ["a trailing space", "abc ", "m", 16, 0],
    ["a fallback font", `a${star}b${diamond}c`, "m", 16, 0],
    ["XML-invalid characters", "a\u0001b\uFFFEc", "m", 16, 0],
  ] as const)("%s", (_name, text, font, size, spacing) => {
    const { drawn, measured } = drawnAndMeasured(text, font, size, spacing);
    expect(drawn).toBeGreaterThan(0);
    expect(measured).toBe(drawn);
  });

  test("a width at size 1 times the size is the width at that size, letter spacing scaled", () => {
    const one = measurer().width("SAMPLE DEVELOPER", "x", 1, -0.01) ?? 0;
    const atSize = measurer().width("SAMPLE DEVELOPER", "x", 117.5, -1.175) ?? 0;
    expect(Math.abs(one * 117.5 - atSize)).toBeLessThan(1e-9);
  });

  test("an empty text is 0 wide and an unknown or inherited font id is undefined", () => {
    const measure = measurer();
    expect(measure.width("", "m", 16, 0)).toBe(0);
    for (const id of ["missing", "__proto__", "constructor", "toString"]) {
      expect(measure.width("abc", id, 16, 0)).toBeUndefined();
      expect(measure.truncate("abc", 10, id, 16, 0)).toBeUndefined();
    }
  });

  test("an unknown font fails the render as an argument binding issue at the expression", () => {
    const result = renderSvg(
      design([{ type: "rect", width: '{{ "a" | textWidth("nope", 16) }}', height: 1 }]),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "binding", path: "/layers/0/width" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain("(argument)");
  });
});

describe("measuring draws nothing", () => {
  test("a font that is only measured is not embedded", () => {
    const result = renderSvg(
      design([
        { type: "text", content: "drawn", font: "m" },
        { type: "rect", width: '{{ "measured" | textWidth("x", 16) }}', height: 1 },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.svg.match(/@font-face/gu)).toHaveLength(1);
    expect(result.svg).not.toContain("font-weight:800");
    expect(result.report.fonts.map((font) => font.asset)).toEqual(["m"]);
  });

  test("a measured emoji warns no missing-glyph; the same emoji drawn does", () => {
    const measured = renderSvg(
      design([{ type: "rect", width: `{{ "a${rocket}" | textWidth("m", 16) }}`, height: 1 }]),
    );
    expect(measured).toMatchObject({ ok: true, warnings: [] });
    const { warnings } = drawnAndMeasured(`a${rocket}`, "m", 16);
    expect(warnings.map((warning) => warning.code)).toEqual(["missing-glyph"]);
  });
});

describe("truncateWidth", () => {
  const text = `Fix the ${rocket} release: ${family} AVATAR kerning`;

  test("the text is unchanged when it fits", () => {
    const measure = measurer();
    const width = measure.width(text, "m", 14, 0) ?? 0;
    expect(measure.truncate(text, width, "m", 14, 0)).toBe(text);
  });

  test("a cut fits, and one more cluster would not", () => {
    const measure = measurer();
    const full = measure.width(text, "m", 14, 0) ?? 0;
    const clusters = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map(
      (part) => part.segment,
    );
    const ellipsis = measure.width("…", "m", 14, 0) ?? 0;
    for (let max = ellipsis; max < full; max += 3.7) {
      const cut = measure.truncate(text, max, "m", 14, 0) ?? "";
      expect(cut.endsWith("…")).toBe(true);
      expect(measure.width(cut, "m", 14, 0)).toBeLessThanOrEqual(max);
      const kept = cut.slice(0, -1);
      expect(text.startsWith(kept)).toBe(true);
      const count = clusters.findIndex((_, index) => clusters.slice(0, index).join("") === kept);
      expect(count).toBeGreaterThanOrEqual(0);
      const next = `${clusters.slice(0, count + 1).join("")}…`;
      // A dropped cluster takes no space, so it is kept as long as the next drawn one does not fit.
      const nextWidth = measure.width(next, "m", 14, 0) ?? 0;
      if (nextWidth > (measure.width(cut, "m", 14, 0) ?? 0)) expect(nextWidth).toBeGreaterThan(max);
    }
  });

  test("a ZWJ emoji sequence is never split", () => {
    const measure = measurer();
    const sample = `ab${family}cd`;
    for (let max = 0; max < 60; max += 0.5) {
      const cut = measure.truncate(sample, max, "m", 14, 0) ?? "";
      expect(["", "…", "a…", "ab…", `ab${family}…`, `ab${family}c…`, sample]).toContain(cut);
    }
  });

  test('"" when even the ellipsis does not fit', () => {
    const measure = measurer();
    const ellipsis = measure.width("…", "m", 14, 0) ?? 0;
    expect(measure.truncate("abcdef", ellipsis - 0.01, "m", 14, 0)).toBe("");
    expect(measure.truncate("abcdef", ellipsis, "m", 14, 0)).toBe("…");
    expect(measure.truncate("abcdef", 0, "m", 14, 0)).toBe("");
  });

  test("drawn, a cut text is the width it was measured at", () => {
    const result = renderSvg(
      design([
        { type: "text", content: '{{ t | truncateWidth(80, "m", 14) }}', font: "m", fontSize: 14 },
      ]),
      { data: { t: text }, layerBoxes: true },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const width = result.layerBoxes?.[0]?.width ?? 0;
    expect(width).toBeGreaterThan(60);
    expect(width).toBeLessThanOrEqual(80);
  });
});
