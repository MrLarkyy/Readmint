import { createScope } from "@readmint/expr";
import type { Design, FontAsset, Layer, TextLayer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { RenderContext } from "../src/RenderContext.js";
import { resolveText } from "../src/resolveText.js";
import { fontAssets } from "./testAssets.js";

const fonts: Record<string, FontAsset> = {
  a: fontAssets.medium,
  b: { ...fontAssets.medium, kerning: false, fallback: ["s"] },
  bold: { ...fontAssets.extraBold, drawAs: "paths" },
  s: fontAssets.symbols,
};

const content = "AVAV Wo ★ To";

/** One variant per field the layout depends on (review probe 16), and the first one again at the end. */
const variants: Partial<TextLayer>[] = [
  { font: "a" },
  { font: "b" },
  { font: "a", letterSpacing: 2 },
  { font: "a", width: 60 },
  { font: "a", width: 60, align: "end" },
  { font: "a", width: 60, align: "middle" },
  { font: "a", fontSize: 20 },
  { font: "a", fontWeight: 800 },
  { font: "b", fontWeight: 800 },
  { font: "a" },
];

const layers = variants.map((variant, index): Layer => ({
  type: "text",
  content,
  y: index * 30,
  font: "a",
  ...variant,
}));

function design(list: Layer[]): Design {
  return { version: 0, canvas: { width: 300, height: 400 }, assets: { fonts }, layers: list };
}

/** The drawn elements of a render: texts and text paths. */
function elements(svg: string): string[] {
  const element = new RegExp(String.raw`<text\s[\s\S]*?</text>|<path\s[^>]*>`, "gu");
  return [...svg.matchAll(element)].map((match) => match[0]);
}

describe("the text layout cache", () => {
  test("each variant of one text gets its own layout: alone it draws what it draws among the others", () => {
    const together = renderSvg(design(layers));
    if (!together.ok) throw new Error(JSON.stringify(together.issues));
    const drawn = elements(together.svg);
    expect(drawn).toHaveLength(variants.length);
    layers.forEach((layer, index) => {
      const alone = renderSvg(design([layer]));
      if (!alone.ok) throw new Error(JSON.stringify(alone.issues));
      expect(elements(alone.svg), JSON.stringify(variants[index])).toEqual([drawn[index]]);
    });
    const placed = (svg: string | undefined) => svg?.replaceAll(/ y="[^"]*"/gu, "");
    expect(new Set(drawn.slice(0, -1).map(placed)).size).toBe(variants.length - 1);
    expect(placed(drawn.at(-1))).toBe(placed(drawn[0]));
  });

  test("the same text twice shares one layout; another value of a key field does not", () => {
    const context = new RenderContext(design([]), {});
    const scope = createScope({});
    const text = (extra: Partial<TextLayer>) =>
      resolveText(context, { type: "text", content, font: "a", ...extra }, "/layers/0", scope);
    const first = text({});
    expect(text({ x: 40 }).lines).toBe(first.lines);
    expect(text({ fontSize: 17 }).lines).not.toBe(first.lines);
    expect(text({ content: "other" }).lines).not.toBe(first.lines);
    expect(context.textLayouts.size).toBe(3);
  });
});
