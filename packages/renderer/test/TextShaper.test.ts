import { ShapingBudget } from "@readmint/fonts";
import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { selectFont } from "../src/loadFont.js";
import { RenderContext } from "../src/RenderContext.js";
import { TextShaper } from "../src/TextShaper.js";
import { fontAssets } from "./testAssets.js";

const fonts: Record<string, FontAsset> = {
  m: { ...fontAssets.medium, fallback: ["n", "s"] },
  n: fontAssets.naskh,
  s: fontAssets.symbols,
  d: fontAssets.devanagari,
};

function design(layers: Layer[] = []): Design {
  return { version: 0, canvas: { width: 400, height: 200 }, assets: { fonts }, layers };
}

function shaper(asset = "m", letterSpacing = 0): TextShaper {
  const context = new RenderContext(design(), {});
  const primary = selectFont(context, asset, undefined, "/layers/0/font");
  return new TextShaper(
    context,
    { referenced: asset, primary, weight: undefined, fontSize: 20, letterSpacing },
    ShapingBudget.forText(1000),
  );
}

function line(text: string, asset = "m", letterSpacing = 0) {
  const instance = shaper(asset, letterSpacing);
  return instance.layout(text, instance.paragraph(text), 0, text.length);
}

describe("TextShaper", () => {
  test("a cluster takes the font of its base; a mark that font has stays with it", () => {
    const glyphs = line("a\u0628\u0650").glyphs;
    // Naskh decomposes beh into a dotless beh and its dot (ccmp); the kasra stays in Naskh too.
    expect(glyphs.map((glyph) => glyph.font?.asset)).toEqual(["m", "n", "n", "n"]);
  });

  test("a mark the base's font lacks takes its own fallback", () => {
    const glyphs = line("\u2605\u0650").glyphs;
    expect(glyphs.map((glyph) => glyph.font?.asset)).toEqual(["s", "n"]);
  });

  test("joiners and bidi controls are shaped, never drawn and never missing", () => {
    const result = renderSvg(
      design([
        { type: "text", content: "a\u200db\u200f\u2067c\u2069", font: "m" },
        { type: "text", y: 40, content: "\u200d\u200c\u2066\u2069", font: "m" },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
    expect(line("a\u200db").glyphs.map((glyph) => glyph.codePoint)).toEqual([0x61, 0x62]);
    expect(line("\u200d\u200c").glyphs).toEqual([]);
  });

  test("a mixed line is in visual order: the Arabic run reversed between the Latin ones", () => {
    const text = "ab \u0627\u0644 cd";
    const glyphs = line(text).glyphs;
    expect(glyphs.map((glyph) => glyph.codePoint)).toEqual([
      0x61, 0x62, 0x20, 0x0644, 0x0627, 0x20, 0x63, 0x64,
    ]);
    const xs = glyphs.map((glyph) => glyph.x);
    expect([...xs].sort((left, right) => left - right)).toEqual(xs);
    expect(line(text).rtl).toBe(false);
    expect(line(`\u0627 ${text}`).rtl).toBe(true);
  });

  test("only glyphs their own character draws are plain", () => {
    const latin = line("office");
    expect(latin.glyphs.map((glyph) => glyph.plain)).toEqual([true, true, false, true, true]);
    expect(latin.glyphs[2]?.text).toBe("fi");
    expect(line("\u0627\u0644").glyphs.every((glyph) => !glyph.plain)).toBe(true);
    const marked = line("e\u0301");
    expect(marked.glyphs.every((glyph) => glyph.text === "e\u0301" && !glyph.plain)).toBe(true);
  });

  test("letter spacing follows each cluster once and turns off optional ligatures", () => {
    expect(line("fi", "m", 5).glyphs.map((glyph) => glyph.text)).toEqual(["f", "i"]);
    expect(line("fi", "m", 0).glyphs.map((glyph) => glyph.text)).toEqual(["fi"]);
    // Two clusters (f, i with its mark): two spacings, not three.
    const spaced = line("fi\u0301", "m", 5).width;
    const tight = line("fi\u0301", "m", 0.001).width;
    expect(spaced - tight).toBeCloseTo(2 * (5 - 0.001), 6);
  });

  test("measure is the width of the same text laid out", () => {
    const instance = shaper();
    for (const text of [
      "office",
      "AV To",
      "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
      "a\u2605b",
    ]) {
      expect(instance.measure(text)).toBe(
        instance.layout(text, instance.paragraph(text), 0, text.length).width,
      );
    }
  });

  test("a word breaks between clusters only: never inside a ligature or a conjunct", () => {
    expect(shaper().clusters("office")).toEqual(["o", "f", "fi", "c", "e"]);
    expect(shaper("d").clusters("\u0915\u094d\u0937\u093f\u0915")).toEqual([
      "\u0915\u094d\u0937\u093f",
      "\u0915",
    ]);
    expect(shaper().clusters("e\u0301a")).toEqual(["e\u0301", "a"]);
  });

  test("private-use characters are the same for every copy of a text and follow first use", () => {
    const text = (content: string, y: number): Layer => ({ type: "text", y, content, font: "m" });
    const render = (layers: Layer[]) => {
      const result = renderSvg(design(layers));
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      return [...result.svg.matchAll(/[\ue000-\uf8ff]/gu)].map((match) => match[0]);
    };
    const once = render([text("fi fl", 0)]);
    expect(once).toEqual(["\ue000", "\ue001"]);
    expect(render([text("fi fl", 0), text("fi fl", 40)])).toEqual([...once, ...once]);
    expect(render([text("fl", 0), text("fi fl", 40)])).toEqual(["\ue000", "\ue001", "\ue000"]);
  });
});
