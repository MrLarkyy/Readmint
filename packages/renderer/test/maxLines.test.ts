import { ShapingBudget } from "@readmint/fonts";
import type { AnimationTrack, Colour, Design, FontAsset, Layer, TextLayer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { createTextMeasurer } from "../src/createTextMeasurer.js";
import { renderSvg } from "../src/index.js";
import { selectFont } from "../src/loadFont.js";
import { RenderContext } from "../src/RenderContext.js";
import { shapeLines } from "../src/shapeLines.js";
import { TextShaper } from "../src/TextShaper.js";
import { fontAssets } from "./testAssets.js";

const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
const arabic = "العربية";

const fonts: Record<string, FontAsset> = {
  m: { ...fontAssets.medium, fallback: ["s"] },
  s: fontAssets.symbols,
  n: fontAssets.naskh,
  p: { ...fontAssets.extraBold, drawAs: "paths" },
};

const three = "The quick brown fox jumps over the lazy dog and keeps running far away";

function design(layers: Layer[], animation?: Design["animation"]): Design {
  return {
    version: 0,
    canvas: { width: 400, height: 200 },
    assets: { fonts },
    ...(animation === undefined ? {} : { animation }),
    layers,
  };
}

function text(extra: Partial<TextLayer>): TextLayer {
  return { type: "text", content: three, font: "m", fontSize: 14, ...extra };
}

function render(layers: Layer[], data: Readonly<Record<string, unknown>> = {}) {
  const result = renderSvg(design(layers), { data });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** The drawn `<text>` and `<path>` elements of a render. */
function elements(svg: string): string[] {
  const element = new RegExp(String.raw`<text\s[\s\S]*?</text>|<path\s[^>]*>`, "gu");
  return [...svg.matchAll(element)].map((match) => match[0]);
}

/** The lines of the first text: its glyphs' x positions and characters, grouped by baseline. */
function lines(svg: string): { y: string; xs: number[]; text: string }[] {
  const byY = new Map<string, { y: string; xs: number[]; text: string }>();
  for (const match of svg.matchAll(/<tspan[^>]* x="([^"]*)" y="([^"]*)"[^>]*>([^<]*)<\/tspan>/gu)) {
    const y = match[2] ?? "";
    const line = byY.get(y) ?? { y, xs: [], text: "" };
    line.xs.push(...(match[1] ?? "").split(" ").map(Number));
    line.text += (match[3] ?? "").replaceAll("&amp;", "&");
    byY.set(y, line);
  }
  return [...byY.values()];
}

/** The lines `shapeLines` keeps of a text in font `m` at 14 px, with the text they draw. */
function shaped(content: string, width: number | undefined, maxLines?: number) {
  const context = new RenderContext(design([]), {});
  const primary = selectFont(context, "m", undefined, "/layers/0/font");
  const options = {
    referenced: "m",
    primary,
    weight: undefined,
    fontSize: 14,
    letterSpacing: 0,
    path: "/layers/0/content",
  };
  const shaper = new TextShaper(context, options, ShapingBudget.forText(64 * content.length));
  return shapeLines(shaper, content, width, maxLines);
}

const measure = createTextMeasurer(new RenderContext(design([]), {}));
const widthOf = (part: string) => measure.width(part, "m", 14, 0) ?? Number.NaN;

describe("a text layer's maxLines", () => {
  test("a text wrapping to 3 lines draws 2, the last ending with … inside the width", () => {
    expect(lines(render([text({ width: 200 })]).svg)).toHaveLength(3);
    const drawn = lines(render([text({ width: 200, maxLines: 2 })]).svg);
    expect(drawn).toHaveLength(2);
    const last = drawn[1];
    expect(last?.text.endsWith("…")).toBe(true);
    expect(widthOf(last?.text ?? "")).toBeLessThanOrEqual(200);
    expect(three.startsWith(`${drawn[0]?.text ?? ""} ${(last?.text ?? "").slice(0, -1)}`)).toBe(
      true,
    );
  });

  test.each([3, 4, 1000])("a text within %i lines renders byte-identically without it", (cap) => {
    expect(render([text({ width: 200, maxLines: cap })]).svg).toBe(
      render([text({ width: 200 })]).svg,
    );
  });

  test("hard line breaks count as lines", () => {
    const drawn = lines(
      render([text({ content: "one\ntwo\nthree", width: 200, maxLines: 2 })]).svg,
    );
    expect(drawn.map((line) => line.text)).toEqual(["one", "two…"]);
    const crlf = shaped("one\r\ntwo\r\nthree", 200, 2);
    expect(crlf.text).toBe("one\r\ntwo…");
  });

  test("without a width the … is appended to the last kept line", () => {
    const drawn = lines(render([text({ content: "one\ntwo\nthree", maxLines: 1 })]).svg);
    expect(drawn.map((line) => line.text)).toEqual(["one…"]);
    expect(render([text({ content: "one\ntwo", maxLines: 2 })]).svg).toBe(
      render([text({ content: "one\ntwo" })]).svg,
    );
  });

  test.each(["middle", "end"] as const)("aligned %s, the cut line stays in the box", (align) => {
    const drawn = lines(render([text({ x: 10, width: 200, maxLines: 2, align })]).svg);
    const last = drawn[1];
    expect(last?.text.endsWith("…")).toBe(true);
    expect(Math.min(...(last?.xs ?? []))).toBeGreaterThanOrEqual(10);
    const lastX = Math.max(...(last?.xs ?? []));
    expect(lastX + widthOf("…")).toBeLessThanOrEqual(210 + 1e-9);
  });

  test("a ZWJ emoji sequence at the cut is never split", () => {
    const content = `ab ${family}${family}${family}${family} cd\nnext`;
    for (let width = 1; width < 120; width += 0.5) {
      const { text: drawn } = shaped(content, width, 1);
      const kept = drawn.endsWith("…") ? drawn.slice(0, -1) : drawn;
      expect(kept.split(family).join("")).not.toMatch(/[‍\u{1F468}\u{1F469}\u{1F467}]/u);
    }
  });

  test("a word broken between clusters is still capped", () => {
    const word = "Supercalifragilisticexpialidocious";
    const result = shaped(word, 60, 2);
    expect(result.lines).toHaveLength(2);
    expect(result.text.endsWith("…")).toBe(true);
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(60);
  });

  test("a kerned cut line is laid out on its own and never wrapped again (RM-91 P Y)", () => {
    const content = "P Y P Y AVATAR P Y To We P Y AVATAR";
    for (let width = 20; width < widthOf(content); width += 3.3) {
      const result = shaped(content, width, 1);
      expect(result.lines).toHaveLength(1);
      if (result.text !== content) expect(result.lines[0]?.width).toBeLessThanOrEqual(width);
    }
  });

  test("maxLines may be bound and is held to its range", () => {
    const bound = render([text({ width: 200, maxLines: "{{ n }}" })], { n: 1 }).svg;
    expect(bound).toBe(render([text({ width: 200, maxLines: 1 })]).svg);
    const out = renderSvg(design([text({ width: 200, maxLines: "{{ n }}" })]), { data: { n: 0 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues[0]?.path).toBe("/layers/0/maxLines");
  });

  test("the accessible name of a capped text is only the drawn text", () => {
    const words = Array.from({ length: 12 }, () => arabic).join(" ");
    const capped = render([text({ content: words, font: "n", width: 120, maxLines: 1 })]).svg;
    const label = /aria-label="([^"]*)"/u.exec(capped)?.[1] ?? "";
    expect(label.endsWith("…")).toBe(true);
    expect(label.length).toBeLessThan(words.length / 2);
    const paths = render([text({ font: "p", width: 200, maxLines: 2 })]).svg;
    const pathLabel = /aria-label="([^"]*)"/u.exec(paths)?.[1] ?? "";
    expect(pathLabel.endsWith("…")).toBe(true);
    expect(three.startsWith(pathLabel.slice(0, -1))).toBe(true);
    expect(pathLabel.length).toBeLessThan(three.length);
  });

  test("the same content with and without maxLines in one design draws as each does alone", () => {
    const layers = [text({ width: 200 }), text({ width: 200, maxLines: 1, y: 100 })];
    const together = elements(render(layers).svg);
    expect(together).toHaveLength(2);
    layers.forEach((layer, index) => {
      expect(elements(render([layer]).svg)).toEqual([together[index]]);
    });
  });

  test("a text of maxTextLength UTF-16 units capped at one line renders", () => {
    const content = "word ".repeat(2000);
    expect(content).toHaveLength(10_000);
    const drawn = lines(render([text({ content, width: 200, maxLines: 1 })]).svg);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.text.endsWith("…")).toBe(true);
    const unbroken = "W".repeat(10_000);
    expect(lines(render([text({ content: unbroken, width: 200, maxLines: 1 })]).svg)).toHaveLength(
      1,
    );
  });

  test("an animated text draws its capped lines", () => {
    const track = {
      keyframes: [
        { offset: 0, value: "#000000" },
        { offset: 1, value: "#ff0000" },
      ],
    } satisfies AnimationTrack<Colour>;
    const layer = text({ width: 200, maxLines: 2, animate: { fill: track } });
    const result = renderSvg(design([layer], { duration: 1000 }), { time: 500 });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const drawn = lines(result.svg);
    expect(drawn).toHaveLength(2);
    expect(drawn[1]?.text.endsWith("…")).toBe(true);
  });

  test("a font without … warns missing-glyph and still draws the kept lines", () => {
    const result = renderSvg(
      design([text({ content: "★ ★ ★ ★ ★ ★ ★ ★ ★ ★", font: "s", width: 30, maxLines: 1 })]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings.map((warning) => warning.code)).toContain("missing-glyph");
    expect(lines(result.svg)).toHaveLength(1);
  });
});
