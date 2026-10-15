import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const symbols: FontAsset = { ...fontAssets.symbols, drawAs: "paths" };

function design(layers: Layer[], fonts: Record<string, FontAsset> = { s: symbols }): Design {
  return { version: 0, canvas: { width: 300, height: 200 }, assets: { fonts }, layers };
}

function render(layers: Layer[], options: RenderOptions = {}, fonts?: Record<string, FontAsset>) {
  const result = renderSvg(design(layers, fonts), options);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

describe("text drawn as paths", () => {
  test("one path per text, the outline scaled, flipped and placed on the baseline", () => {
    // Size 100: scale 0.1; ascender 800, descender -200, line height 120, so the baseline is at 90.
    const { svg } = render([{ type: "text", content: "★", font: "s", fontSize: 100 }]);
    expect(svg.match(/<path /gu)).toHaveLength(1);
    expect(svg).toContain(
      '<path d="M39 19L47.8 44.9L75.1 45.3L53.3 61.6L61.3 87.7L39 72L16.7 87.7L24.7 61.6L2.9 45.3L30.2 44.9Z" fill-rule="nonzero" aria-label="★"/>',
    );
  });

  test("quadratic outlines stay quadratic and every glyph is placed at its pen position", () => {
    const { svg } = render([{ type: "text", x: 5, content: "● ●", font: "s", fontSize: 10 }]);
    const d = /<path d="([^"]*)"/u.exec(svg)?.[1] ?? "";
    expect(d.match(/M/gu)).toHaveLength(2);
    expect(d.match(/Q/gu)).toHaveLength(8);
    // Circle advance 600 and space 250 at size 10: the second circle starts 8.5 further right.
    expect(d.startsWith("M8 3.5Q")).toBe(true);
    expect(d).toContain("ZM16.5 3.5Q");
  });

  test("the text is the accessible name, escaped", () => {
    const { svg } = render([{ type: "text", content: '★ <&"> ★', font: "s" }]);
    expect(svg).toContain('aria-label="★ &lt;&amp;&quot;&gt; ★"');
  });

  test("a text with nothing to draw writes no path", () => {
    const { svg } = render([{ type: "text", content: "   ", font: "s" }]);
    expect(svg).not.toContain("<path");
  });

  test("paint, opacity and rotation apply to the path as they would to the text", () => {
    const { svg } = render([
      { type: "text", content: "★", font: "s", fill: "#ff000080", opacity: 0.5, rotation: 90 },
    ]);
    expect(svg).toMatch(
      /<path d="[^"]+" fill-rule="nonzero" aria-label="★" fill="#ff0000" fill-opacity="0.502" opacity="0.5" transform="rotate\(90 /u,
    );
  });

  test("a long text over a small budget stops while its path data is built", () => {
    const result = renderSvg(design([{ type: "text", content: "★".repeat(10_000), font: "s" }]), {
      limits: { maxOutputBytes: 50_000 },
    });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "too-large" }] });
    const reached = Number(
      /reached (\d+)/u.exec(result.ok ? "" : (result.issues[0]?.message ?? ""))?.[1],
    );
    expect(reached).toBeLessThan(50_200);
  });

  test("the report counts the path data of each font", () => {
    const result = render([{ type: "text", content: "★★", font: "s" }]);
    const d = /<path d="([^"]*)"/u.exec(result.svg)?.[1] ?? "";
    expect(result.report.fonts).toEqual([
      { asset: "s", bytes: d.length, glyphs: 1, drawnAs: "paths" },
    ]);
  });
});
