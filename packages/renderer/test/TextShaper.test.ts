import { ShapingBudget } from "@readmint/fonts";
import { buildTestFont } from "../../fonts/test/buildTestFont.js";
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
    {
      referenced: asset,
      primary,
      weight: undefined,
      fontSize: 20,
      letterSpacing,
      path: "/layers/0/content",
    },
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
    // Montserrat has U+00E9: e U+0301 is drawn as that one plain character, its text still as written.
    const composed = line("e\u0301").glyphs;
    expect(composed.map((glyph) => [glyph.codePoint, glyph.text, glyph.plain])).toEqual([
      [0xe9, "e\u0301", true],
    ]);
    const marked = line("x\u0301");
    expect(marked.glyphs.every((glyph) => glyph.text === "x\u0301" && !glyph.plain)).toBe(true);
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

  test("a cluster no font covers adds no width", () => {
    const instance = shaper();
    expect(instance.measure("a\u{1f377}b")).toBe(instance.measure("ab"));
    expect(shaper("m", 3).measure("a\u{1f377}b")).toBe(shaper("m", 3).measure("ab"));
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

describe("TextShaper with canonically equivalent text", () => {
  const square = [
    [
      [0, 0, true],
      [400, 0, true],
      [400, 500, true],
      [0, 500, true],
    ],
  ] as const;
  const built = (...codePoints: number[]) =>
    buildTestFont({
      family: "Built",
      glyphs: [
        { advance: 500 },
        ...codePoints.map((codePoint) => ({
          codePoints: [codePoint],
          advance: codePoint === 0x301 ? 0 : 500,
          contours: square,
        })),
      ],
    });
  const decomposedOnly = built(0x63, 0x65, 0x301);
  const precomposedOnly = built(0x63, 0x65, 0xe9);
  const builtFonts: Record<string, FontAsset> = {
    d: { family: "Built", src: "d.ttf", licence: { embedding: "allowed" }, fallback: ["m"] },
    p: { family: "Built", src: "p.ttf", licence: { embedding: "allowed" }, fallback: ["m"] },
    e: { family: "Built", src: "e.ttf", licence: { embedding: "allowed" }, fallback: ["m"] },
    k: { family: "Built", src: "k.ttf", licence: { embedding: "allowed" } },
    j: { family: "Built", src: "j.ttf", licence: { embedding: "allowed" } },
    s: { family: "Built", src: "s.ttf", licence: { embedding: "allowed" } },
    m: fontAssets.medium,
  };
  const assets = {
    fonts: {
      d: decomposedOnly,
      p: precomposedOnly,
      e: built(0x63, 0x65),
      k: built(0xac01),
      j: built(0xac00, 0xac01),
      s: built(0x56, 0x69, 0x74, 0x1ec7),
    },
  };

  function renderBuilt(asset: string, content: string) {
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 200, height: 60 },
        assets: { fonts: builtFonts },
        layers: [{ type: "text", content, font: asset }],
      },
      { assets },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result;
  }

  function builtLine(asset: string, text: string) {
    const context = new RenderContext(
      {
        version: 0,
        canvas: { width: 400, height: 200 },
        assets: { fonts: builtFonts },
        layers: [],
      },
      { assets },
    );
    const instance = new TextShaper(
      context,
      {
        referenced: asset,
        primary: selectFont(context, asset, undefined, "/layers/0/font"),
        weight: undefined,
        fontSize: 20,
        letterSpacing: 0,
        path: "/layers/0/content",
      },
      ShapingBudget.forText(1000),
    );
    return { instance, line: instance.layout(text, instance.paragraph(text), 0, text.length) };
  }

  test("a font with base and mark draws a precomposed letter itself, not from a fallback", () => {
    const { instance, line: drawn } = builtLine("d", "c\u00e9");
    expect(drawn.glyphs.map((glyph) => glyph.font?.asset)).toEqual(["d", "d", "d"]);
    expect(instance.lacks(0xe9)).toBe(false);
    const result = renderSvg(
      {
        version: 0,
        canvas: { width: 200, height: 60 },
        assets: { fonts: builtFonts },
        layers: [{ type: "text", content: "c\u00e9", font: "d" }],
      },
      { assets },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
  });

  test("a font with the precomposed letter but not the mark keeps the decomposed letter", () => {
    const { line: drawn } = builtLine("p", "ce\u0301");
    expect(drawn.glyphs.map((glyph) => [glyph.font?.asset, glyph.codePoint, glyph.plain])).toEqual([
      ["p", 0x63, true],
      ["p", 0xe9, true],
    ]);
    expect(drawn.glyphs[1]?.text).toBe("e\u0301");
  });

  test("every spelling of a cluster renders to the same SVG, without missing glyphs", () => {
    const cases: [string, string[]][] = [
      // Only e: the whole cluster takes the fallback that has it, for both spellings.
      ["e", ["c\u00e9", "ce\u0301"]],
      // Only the syllable U+AC01: neither U+AC00 nor conjoining jamo.
      ["k", ["\uac01", "\u1100\u1161\u11a8", "\uac00\u11a8"]],
      // A default ignorable the font lacks stays in the cluster without hiding the syllable.
      ["k", ["\uac01\u200b", "\u1100\u1161\u11a8\u200b", "\uac00\u11a8\u200b"]],
      ["k", ["\uac01\u200d", "\u1100\u1161\u11a8\u200d"]],
      // Syllables, no conjoining jamo.
      ["j", ["\uac01", "\u1100\u1161\u11a8"]],
      // A subset with U+1EC7 but neither U+00EA, U+1EB9 nor the marks.
      ["s", ["Vi\u1ec7t", "Vie\u0323\u0302t", "Vie\u0302\u0323t", "Vi\u1eb9\u0302t"]],
    ];
    for (const [asset, spellings] of cases) {
      const results = spellings.map((content) => renderBuilt(asset, content));
      for (const result of results) {
        expect(result.warnings).toEqual([]);
        expect(result.svg).toBe(results[0]?.svg);
      }
    }
    for (const content of ["\uac01\u200b", "\u1100\u1161\u11a8\u200b"]) {
      const { line: zeroWidth } = builtLine("k", content);
      expect(zeroWidth.glyphs.map((glyph) => [glyph.font?.asset, glyph.codePoint])).toEqual([
        ["k", 0xac01],
      ]);
      expect(renderBuilt("k", content).svg).toContain("\uac01");
    }
    const { line: korean } = builtLine("j", "\u1100\u1161\u11a8");
    expect(korean.glyphs.map((glyph) => [glyph.font?.asset, glyph.codePoint, glyph.plain])).toEqual(
      [["j", 0xac01, true]],
    );
    const { line: fallback } = builtLine("e", "ce\u0301");
    expect(fallback.glyphs.map((glyph) => [glyph.font?.asset, glyph.codePoint])).toEqual([
      ["e", 0x63],
      ["m", 0xe9],
    ]);
  });

  describe("space variants and U+2011 the font lacks", () => {
    const glyph = (codePoint: number, advance: number) => ({
      codePoints: [codePoint],
      advance,
      contours: square,
    });
    const spaced = (...extra: ReturnType<typeof glyph>[]) =>
      buildTestFont({
        family: "Built",
        glyphs: [{ advance: 500 }, glyph(0x20, 250), glyph(0x41, 500), glyph(0x2d, 300), ...extra],
      });
    const spaceAssets = {
      fonts: {
        a: spaced(),
        p: spaced(),
        b: buildTestFont({
          family: "Built",
          glyphs: [{ advance: 500 }, glyph(0x20, 250), glyph(0x41, 500), glyph(0x2d, 300)],
        }),
        c: buildTestFont({ family: "Built", glyphs: [{ advance: 500 }, glyph(0x41, 500)] }),
      },
    };
    const spaceFonts: Record<string, FontAsset> = {
      a: { family: "Built", src: "a.ttf", licence: { embedding: "allowed" } },
      p: { family: "Built", src: "a.ttf", licence: { embedding: "allowed" }, drawAs: "paths" },
      b: { family: "Built", src: "b.ttf", licence: { embedding: "allowed" }, fallback: ["m"] },
      c: { family: "Built", src: "c.ttf", licence: { embedding: "allowed" } },
      m: fontAssets.medium,
    };
    const run = (asset: string, content: string) => {
      const result = renderSvg(
        {
          version: 0,
          canvas: { width: 400, height: 60 },
          assets: { fonts: spaceFonts },
          layers: [{ type: "text", content, font: asset, fontSize: 20 }],
        },
        { assets: spaceAssets },
      );
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      return result;
    };
    const lineOf = (asset: string, text: string) => {
      const context = new RenderContext(
        {
          version: 0,
          canvas: { width: 400, height: 60 },
          assets: { fonts: spaceFonts },
          layers: [],
        },
        { assets: spaceAssets },
      );
      const instance = new TextShaper(
        context,
        {
          referenced: asset,
          primary: selectFont(context, asset, undefined, "/layers/0/font"),
          weight: undefined,
          fontSize: 20,
          letterSpacing: 0,
          path: "/layers/0/content",
        },
        ShapingBudget.forText(1000),
      );
      return instance.layout(text, instance.paragraph(text), 0, text.length);
    };

    test("draw from the font's own space and hyphen glyphs without a warning", () => {
      const line = lineOf("a", "A\u2003A\u2011A");
      expect(line.glyphs.map((entry) => [entry.font?.asset, entry.x])).toEqual([
        ["a", 0],
        ["a", 10],
        ["a", 30],
        ["a", 40],
        ["a", 46],
      ]);
      const font = run("a", "A\u2003A\u2011A");
      expect(font.warnings).toEqual([]);
      expect(font.svg).toContain("aria-label");
      expect(font.svg).toContain("\u2003");
      expect(font.svg).toContain("\u2011");
      expect(run("p", "A\u2003A\u2011A").warnings).toEqual([]);
    });

    test("are drawn by the text's own font before its fallback fonts", () => {
      const line = lineOf("b", "A\u2009A");
      expect(line.glyphs.map((entry) => entry.font?.asset)).toEqual(["b", "b", "b"]);
      expect(line.glyphs[2]?.x).toBe(10 + 4);
      expect(run("b", "A\u2009A").warnings).toEqual([]);
    });

    test("stay missing in a font without a space glyph", () => {
      const result = run("c", "A\u2003A");
      expect(result.warnings).toEqual([
        {
          path: "/assets/fonts/c",
          code: "missing-glyph",
          message: expect.stringContaining("U+2003") as string,
        },
      ]);
    });

    test("render the same bytes twice, and for the canonical singleton spellings", () => {
      const first = run("a", "A\u2000A\u2001A").svg;
      expect(run("a", "A\u2000A\u2001A").svg).toBe(first);
      expect(run("a", "A\u2002A\u2003A").svg).toBe(
        first.replaceAll("\u2000", "\u2002").replaceAll("\u2001", "\u2003"),
      );
    });
  });
});
