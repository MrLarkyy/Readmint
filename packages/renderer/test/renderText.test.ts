import { parseSfnt, type SfntFont } from "@readmint/fonts";
import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
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
    const { svg } = render([{ type: "text", content: "a★b", font: "m" }], {
      m: { ...fontAssets.medium, fallback: ["s"] },
      s: fontAssets.symbols,
    });
    const found = spans(svg);
    expect(found.map((span) => span.text)).toEqual(["a", "★", "b"]);
    expect(found[0]?.attributes).not.toContain("font-family");
    expect(found[1]?.attributes).toContain(
      'font-family="&#39;Readmint Test Symbols&#39;" font-weight="400"',
    );
    expect(svg.match(/@font-face/gu)).toHaveLength(2);
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

  test("a character no font has is not written, keeps its advance and warns once per font", () => {
    const result = render([
      { type: "text", content: "a漢b", font: "m", fontSize: 10 },
      { type: "text", y: 20, content: "漢漣", font: "m" },
    ]);
    const [first] = spans(result.svg);
    expect(first?.text).toBe("ab");
    const notdef = (medium.advanceOf(0) * 10) / medium.unitsPerEm;
    const a = (medium.advanceOf(medium.glyphFor(0x61)) * 10) / medium.unitsPerEm;
    expect(xs(first?.attributes ?? "")).toEqual([0, Math.round((a + notdef) * 1000) / 1000]);
    expect(result.svg).not.toContain("漢");
    expect(result.warnings).toEqual([
      {
        path: "/assets/fonts/m",
        code: "missing-glyph",
        message: expect.stringContaining("U+6F22, U+6F23") as string,
      },
    ]);
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
