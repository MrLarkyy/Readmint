import { parseSfnt, type SfntFont } from "@readmint/fonts";
import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { layoutTable, struct } from "../../fonts/test/buildLayoutTables.js";
import { buildTestFont } from "../../fonts/test/buildTestFont.js";
import { renderSvg } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const medium = parsed(fontAssets.medium.src);

function parsed(dataUri: string): SfntFont {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const result = parseSfnt(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
  if (!result.ok) throw new Error(result.message);
  return result.font;
}

function render(layers: Layer[], fonts: Record<string, FontAsset> = { m: fontAssets.medium }) {
  const design: Design = {
    version: 0,
    canvas: { width: 300, height: 100 },
    assets: { fonts },
    layers,
  };
  const result = renderSvg(design);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

function spans(svg: string): { attributes: string; text: string }[] {
  return [...svg.matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/gu)].map((match) => ({
    attributes: match[1] ?? "",
    text: match[2] ?? "",
  }));
}

function xs(attributes: string): number[] {
  return (/ x="([^"]*)"/u.exec(attributes)?.[1] ?? "").split(" ").map(Number);
}

/** The SVG without its accessible name, which keeps the text as written (emoji included). */
function unlabelled(svg: string): string {
  return svg.replace(/ aria-label="[^"]*"/gu, "");
}

interface Expectation {
  readonly spacing?: number;
  readonly kern?: boolean;
}

/** Pen positions the renderer must write: advances plus spacing, kerning when on, from the box's left. */
function expected(text: string, size: number, options: Expectation = {}): number[] {
  return layout(text, size, options).positions;
}

function layout(
  text: string,
  size: number,
  options: Expectation,
): { positions: number[]; width: number } {
  const scale = size / medium.unitsPerEm;
  const positions: number[] = [];
  let x = 0;
  let previous: number | undefined;
  for (const char of text) {
    const glyph = medium.glyphFor(char.codePointAt(0) ?? 0);
    if (previous !== undefined && options.kern !== false)
      x += medium.kerning(previous, glyph) * scale;
    positions.push(Math.round(x * 1000) / 1000);
    x += medium.advanceOf(glyph) * scale + (options.spacing ?? 0);
    previous = glyph;
  }
  return { positions, width: x };
}

describe("renderText", () => {
  test("every text asks for geometric precision so Chromium on Linux keeps fractional advances", () => {
    const result = render([
      { type: "text", content: "one", font: "m" },
      { type: "text", y: 20, content: "two", font: "m" },
    ]);
    const texts = result.svg.match(/<text [^>]*>/gu) ?? [];
    expect(texts).toHaveLength(2);
    for (const text of texts) expect(text).toContain(' text-rendering="geometricPrecision"');
  });

  test("every character gets the x the renderer measured, kerning included", () => {
    const { svg } = render([{ type: "text", content: "AV To", font: "m", fontSize: 20 }]);
    const [span] = spans(svg);
    expect(span?.text).toBe("AV To");
    expect(xs(span?.attributes ?? "")).toEqual(expected("AV To", 20));
    expect(medium.kerning(medium.glyphFor(0x41), medium.glyphFor(0x56))).toBeLessThan(0);
  });

  test("kerning: false places the glyphs by their advances only", () => {
    const { svg } = render([{ type: "text", content: "AV To", font: "m", fontSize: 20 }], {
      m: { ...fontAssets.medium, kerning: false },
    });
    expect(xs(spans(svg)[0]?.attributes ?? "")).toEqual(expected("AV To", 20, { kern: false }));
  });

  test("letter spacing is added once per character and never left to the drawer", () => {
    const { svg } = render([
      { type: "text", content: "abc", font: "m", fontSize: 20, letterSpacing: 3 },
    ]);
    expect(svg).not.toContain("letter-spacing");
    expect(xs(spans(svg)[0]?.attributes ?? "")).toEqual(expected("abc", 20, { spacing: 3 }));
  });

  test.each([
    ["middle", 0.5],
    ["end", 1],
  ] as const)("align %s moves the line inside the box, without text-anchor", (align, share) => {
    const { svg } = render([
      { type: "text", x: 10, width: 200, content: "abc", font: "m", fontSize: 20, align },
    ]);
    expect(svg).not.toContain("text-anchor");
    const { positions, width } = layout("abc", 20, {});
    const offset = 10 + (200 - width) * share;
    expect(xs(spans(svg)[0]?.attributes ?? "")).toEqual(
      positions.map((x) => Math.round((offset + x) * 1000) / 1000),
    );
  });

  test("a character from a fallback font gets its own tspan with the fallback's family and weight", () => {
    const { svg } = render([{ type: "text", content: "a\u2605b", font: "m" }], {
      m: { ...fontAssets.medium, fallback: ["s"] },
      s: fontAssets.symbols,
    });
    const found = spans(svg);
    expect(found.map((span) => span.text)).toEqual(["a", "\u2605", "b"]);
    expect(found[0]?.attributes).not.toContain("font-family");
    expect(found[1]?.attributes).toContain(
      'font-family="&#39;Readmint Test Symbols&#39;" font-weight="400"',
    );
    expect(svg.match(/@font-face/gu)).toHaveLength(2);
  });

  test("an upright fallback in italic text says normal, and no other tspan gains a style", () => {
    const tspanOf = (main: FontAsset, fallback: FontAsset): string => {
      const { svg } = render([{ type: "text", content: "a★b", font: "m" }], {
        m: { ...main, fallback: ["s"] },
        s: fallback,
      });
      return spans(svg)[1]?.attributes ?? "";
    };
    const italic = { ...fontAssets.medium, style: "italic" as const };
    expect(tspanOf(italic, fontAssets.symbols)).toContain('font-style="normal"');
    expect(tspanOf(fontAssets.medium, fontAssets.symbols)).not.toContain("font-style");
    expect(tspanOf(fontAssets.medium, { ...fontAssets.symbols, style: "italic" })).toContain(
      'font-style="italic"',
    );
  });

  test("a character above the BMP gets a tspan of its own with a single x", () => {
    const { svg } = render([{ type: "text", content: "\u{1f536}\u{1f536}", font: "m" }], {
      m: { ...fontAssets.medium, fallback: ["s"] },
      s: fontAssets.symbols,
    });
    const found = spans(svg);
    expect(found.map((span) => span.text)).toEqual(["\u{1f536}", "\u{1f536}"]);
    for (const span of found) expect(xs(span.attributes)).toHaveLength(1);
  });

  test("a character no font has is not written, takes no space and warns once per font", () => {
    const result = render([
      { type: "text", content: "a\u6f22b", font: "m", fontSize: 10 },
      { type: "text", y: 20, content: "\u6f22\u6f23", font: "m" },
    ]);
    const [first] = spans(result.svg);
    expect(first?.text).toBe("ab");
    expect(xs(first?.attributes ?? "")).toEqual(expected("ab", 10));
    expect(result.svg).not.toContain("\u6f22");
    expect(result.warnings).toEqual([
      {
        path: "/assets/fonts/m",
        code: "missing-glyph",
        message: expect.stringContaining("U+6F22, U+6F23") as string,
      },
    ]);
  });

  describe("emoji no font has", () => {
    const emoji = [
      "\u{1f377}",
      "\u{1f469}\u200d\u{1f4bb}",
      "\u{1f1e8}\u{1f1ff}",
      "\u{1f44d}\u{1f3fd}",
      "\u2764\ufe0f",
    ];

    test.each(emoji)("%s between letters takes no space", (cluster) => {
      const { svg } = render([
        { type: "text", content: "a" + cluster + "b", font: "m", fontSize: 20 },
      ]);
      const positions = spans(svg).map((span) => xs(span.attributes));
      expect(positions.flat().slice(-1)).toEqual(expected("ab", 20).slice(-1));
    });

    test("a keycap keeps its digit and drops the enclosing mark", () => {
      const keycap = render([
        { type: "text", content: "a1\ufe0f\u20e3b", font: "m", fontSize: 20 },
      ]);
      const plain = render([{ type: "text", content: "a1b", font: "m", fontSize: 20 }]);
      expect(spans(keycap.svg).flatMap((span) => xs(span.attributes))).toEqual(
        spans(plain.svg).flatMap((span) => xs(span.attributes)),
      );
    });

    test("letter spacing does not count a dropped cluster", () => {
      const { svg } = render([
        { type: "text", content: "a\u{1f377}b", font: "m", fontSize: 20, letterSpacing: 2 },
      ]);
      const found = spans(svg).flatMap((span) => xs(span.attributes));
      expect(found.slice(-1)).toEqual(expected("ab", 20, { spacing: 2 }).slice(-1));
    });

    test("the same in paths mode", () => {
      const content = "a\u{1f377}b \u{1f469}\u200d\u{1f4bb}c";
      const fonts = { m: { ...fontAssets.medium, drawAs: "paths" as const } };
      const paths = render([{ type: "text", content, font: "m" }], fonts);
      const clean = render([{ type: "text", content: "ab c", font: "m" }], fonts);
      expect(unlabelled(paths.svg)).toBe(unlabelled(clean.svg));
      expect(paths.warnings.map((warning) => warning.code)).toEqual(["missing-glyph"]);
    });

    test("the warning names pictographic characters only, not joiners or selectors", () => {
      const { warnings } = render([
        { type: "text", content: "\u{1f469}\u200d\u{1f4bb} \u2764\ufe0f", font: "m" },
      ]);
      const message = warnings[0]?.message ?? "";
      expect(message).toContain("U+1F469, U+1F4BB, U+2764");
      expect(message).not.toMatch(/U\+(200D|FE0F)/u);
    });

    test("a word of emoji only measures nothing and wraps without failing", () => {
      const result = render([
        { type: "text", width: 40, content: "\u{1f377}\u{1f377}\u{1f377} ab", font: "m" },
      ]);
      expect(
        spans(result.svg)
          .map((span) => span.text)
          .join(""),
      ).toContain("ab");
    });

    test("an Arabic text followed by an emoji lays out as without", () => {
      const fonts = { m: { ...fontAssets.medium, fallback: ["n"] }, n: fontAssets.naskh };
      const text = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629 ";
      const withEmoji = render([{ type: "text", content: text + "\u{1f377}", font: "m" }], fonts);
      const without = render([{ type: "text", content: text, font: "m" }], fonts);
      expect(unlabelled(withEmoji.svg)).toBe(unlabelled(without.svg));
    });

    test("renders the same bytes twice", () => {
      const layers: Layer[] = [{ type: "text", content: "a\u{1f377}b".repeat(50), font: "m" }];
      expect(render(layers).svg).toBe(render(layers).svg);
    });
  });

  test("the embedded subset maps exactly the characters drawn with it", () => {
    const result = render([{ type: "text", content: "abba", font: "m" }]);
    expect(result.report.fonts).toEqual([
      { asset: "m", bytes: expect.any(Number) as number, glyphs: 2, drawnAs: "font" },
    ]);
    const base64 = /url\(data:font\/woff;base64,([^)]+)\)/u.exec(result.svg)?.[1] ?? "";
    const subset = parseSfnt(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
    if (!subset.ok) throw new Error(subset.message);
    expect(subset.font.numGlyphs).toBe(3);
    expect(subset.font.glyphFor(0x61)).not.toBe(0);
    expect(subset.font.glyphFor(0x62)).not.toBe(0);
    expect(subset.font.glyphFor(0x63)).toBe(0);
    expect(subset.font.table("GPOS")).toBeUndefined();
  });
});

test("a missing character is reported for the asset the text names, whose fallbacks were tried (review probe 8)", () => {
  const result = render(
    [{ type: "text", content: "A\u6f22\u2605", font: "medium", fontWeight: 800 }],
    {
      medium: { ...fontAssets.medium, fallback: ["sym"] },
      bold: fontAssets.extraBold,
      sym: fontAssets.symbols,
    },
  );
  expect(result.warnings).toEqual([
    {
      path: "/assets/fonts/medium",
      code: "missing-glyph",
      message: expect.stringContaining("U+6F22") as string,
    },
  ]);
  expect(result.report.fonts.map((font) => font.asset)).toEqual(["bold", "sym"]);
});

describe("renderText with shaped glyphs", () => {
  const subsetOf = (svg: string, index = 0): SfntFont => {
    const base64 = [...svg.matchAll(/url\(data:font\/woff;base64,([^)]+)\)/gu)][index]?.[1] ?? "";
    const woff = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const result = parseSfnt(woff);
    if (!result.ok) throw new Error(result.message);
    return result.font;
  };

  test("plain text writes its own characters and no aria-label or bidi override", () => {
    const { svg } = render([{ type: "text", content: "AV To", font: "m" }]);
    expect(svg).not.toContain("aria-label");
    expect(svg).not.toContain("unicode-bidi");
    expect(svg).not.toMatch(/[\ue000-\uf8ff]/u);
  });

  test("a ligature is written as a private-use character its subset maps; the text carries its own text as aria-label", () => {
    const { svg } = render([{ type: "text", content: "fit", font: "m" }]);
    expect(svg).toContain('aria-label="fit"');
    expect(spans(svg).map((span) => span.text)).toEqual(["\ue000t"]);
    const subset = subsetOf(svg);
    expect(subset.glyphFor(0xe000)).not.toBe(0);
    expect(subset.glyphFor(0x74)).not.toBe(0);
    expect(subset.glyphFor(0x66)).toBe(0);
    // The ligature is a composite: its components come along, unmapped.
    expect(subset.numGlyphs).toBeGreaterThanOrEqual(3);
  });

  test("right-to-left text asks the drawer to keep the order written; marks get a y of their own", () => {
    const { svg } = render([{ type: "text", content: "\u0628\u0650", font: "n", fontSize: 30 }], {
      n: fontAssets.naskh,
    });
    expect(svg).toContain(' direction="ltr" unicode-bidi="bidi-override"');
    const [span] = spans(svg);
    const ys = (/ y="([^"]*)"/u.exec(span?.attributes ?? "")?.[1] ?? "").split(" ").map(Number);
    expect(ys.length).toBe(xs(span?.attributes ?? "").length);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });

  test("past 6400 shaped glyphs a font's private-use characters go on in plane 15, each in a tspan of its own", () => {
    const count = 6402;
    const glyphs = [
      { advance: 500 },
      ...Array.from({ length: count }, (_, index) => ({
        codePoints: [0x4e00 + index],
        advance: 500,
      })),
    ];
    // GPOS raises every glyph, so none is plain and each needs a private-use character.
    const raise = struct([1, { offset: struct([2, 1, 1, count, 0]) }, 0x0002, { i16: 50 }]);
    const gpos = layoutTable([{ tag: "kern", lookups: [0] }], [{ type: 1, subtables: [raise] }]);
    const bytes = buildTestFont({ family: "Many", glyphs, tables: { GPOS: gpos } });
    const content = String.fromCodePoint(
      ...Array.from({ length: 6401 }, (_, index) => 0x4e00 + index),
    );
    const design: Design = {
      version: 0,
      canvas: { width: 300, height: 100 },
      assets: {
        fonts: { many: { family: "Many", src: "many.ttf", licence: { embedding: "allowed" } } },
      },
      layers: [{ type: "text", content, font: "many", fontSize: 4 }],
    };
    const result = renderSvg(design, { assets: { fonts: { many: bytes } } });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const found = spans(result.svg);
    expect(found).toHaveLength(2);
    expect(Array.from(found[0]?.text ?? "")).toHaveLength(6400);
    expect(found[0]?.text.startsWith("\ue000")).toBe(true);
    expect(found[1]?.text).toBe("\u{f0000}");
    expect(xs(found[1]?.attributes ?? "")).toHaveLength(1);
    expect(subsetOf(result.svg).glyphFor(0xf0000)).not.toBe(0);
  });
});

test("a private-use character of the text itself is renumbered, so it never collides with a shaped glyph's", () => {
  // U+E000 is a glyph of its own in this font; GPOS raises x, so x needs a private-use character too.
  const raise = struct([1, { offset: struct([1, 1, 2]) }, 0x0002, { i16: 40 }]);
  const gpos = layoutTable([{ tag: "kern", lookups: [0] }], [{ type: 1, subtables: [raise] }]);
  const bytes = buildTestFont({
    family: "Private",
    glyphs: [
      { advance: 500 },
      {
        codePoints: [0xe000],
        advance: 500,
        contours: [
          [
            [0, 0, true],
            [400, 0, true],
            [0, 400, true],
          ],
        ],
      },
      {
        codePoints: [0x78],
        advance: 500,
        contours: [
          [
            [0, 0, true],
            [300, 300, true],
            [0, 300, true],
          ],
        ],
      },
    ],
    tables: { GPOS: gpos },
  });
  const design: Design = {
    version: 0,
    canvas: { width: 100, height: 40 },
    assets: {
      fonts: { p: { family: "Private", src: "p.ttf", licence: { embedding: "allowed" } } },
    },
    layers: [{ type: "text", content: "x\ue000", font: "p" }],
  };
  const result = renderSvg(design, { assets: { fonts: { p: bytes } } });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(spans(result.svg).map((span) => span.text)).toEqual(["\ue000\ue001"]);
  const base64 = /url\(data:font\/woff;base64,([^)]+)\)/u.exec(result.svg)?.[1] ?? "";
  const subset = parseSfnt(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
  if (!subset.ok) throw new Error(subset.message);
  const raised = subset.font.glyphFor(0xe000);
  const own = subset.font.glyphFor(0xe001);
  expect(raised).not.toBe(0);
  expect(own).not.toBe(0);
  expect(raised).not.toBe(own);
});

test("canonically equivalent contents render to the same bytes with Montserrat, in font and paths mode", () => {
  // Decomposed, with the marks of Viet out of canonical order; then precomposed.
  const decomposed = "Cafe\u0301 / Tie\u0302\u0301ng / Vie\u0302\u0323t";
  const precomposed = "Caf\u00e9 / Ti\u1ebfng / Vi\u1ec7t";
  const paths: FontAsset = { ...fontAssets.medium, drawAs: "paths" };
  for (const fonts of [{ m: fontAssets.medium }, { m: paths }]) {
    const svg = (content: string) => render([{ type: "text", content, font: "m" }], fonts).svg;
    const first = svg(decomposed);
    expect(first).toBe(svg(precomposed));
    expect(svg(decomposed)).toBe(first);
  }
  // Font mode writes the precomposed letters as plain characters: no private-use character, no aria-label.
  const font = render([{ type: "text", content: decomposed, font: "m" }]).svg;
  expect(spans(font).map((span) => span.text)).toEqual([precomposed]);
  expect(font).not.toContain("aria-label");
});
