import { escapeCssString } from "./escapeCssString.js";
import { escapeAttribute, escapeText } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import type { LoadedFont } from "./loadFont.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import { paintAttributes } from "./paint.js";
import type { TextNode } from "./RenderNode.js";
import type { SvgWriter } from "./SvgWriter.js";
import type { PlacedGlyph, TextRun } from "./TextLine.js";

/**
 * One `<text>` drawn with the embedded subsets: per line, a `<tspan>` per run of one font with an `x` for every
 * character (and a `y` for every one when some glyph sits off the baseline), so the drawer places each glyph where
 * the renderer did (no shaping, kerning, reordering or alignment of its own). A shaped glyph no character draws is
 * written as a private-use character its subset maps to it; the text then carries `aria-label` with its own text,
 * and a text with right-to-left glyphs asks for `bidi-override` so the visual order written stays. A character above
 * the BMP gets a `<tspan>` of its own, since drawers count `x` values in UTF-16 units or in code points.
 * `xml:space="preserve"` keeps the spaces; `text-rendering="geometricPrecision"` stops Chromium on Linux from
 * rounding glyphs to hinted whole pixels.
 */
export function renderText(writer: SvgWriter, node: TextNode, extra = ""): void {
  const spans = node.lines
    .map((line, index) => {
      const baseline = node.y + node.baseline + index * node.lineAdvance;
      return line.runs.map((run) => runSpans(node, run, baseline)).join("");
    })
    .join("");
  const box = { x: node.x, y: node.y, width: node.width, height: node.height };
  const label = node.privateUse ? ` aria-label="${escapeAttribute(node.text)}"` : "";
  const order = node.rtl ? ' direction="ltr" unicode-bidi="bidi-override"' : "";
  writer.write(
    `<text xml:space="preserve" text-rendering="geometricPrecision"${fontAttributes(node.font)} font-size="${formatNumber(node.fontSize)}"${order}${label}${paintAttributes(writer, "fill", node.fill, box)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}>${spans}</text>`,
  );
}

/**
 * Family, weight and the face's own style, matching its @font-face rule; without the style an italic face would
 * draw as the regular one.
 */
function fontAttributes(font: LoadedFont): string {
  const family = escapeAttribute(`'${escapeCssString(font.family)}'`);
  const style = font.style === "italic" ? ' font-style="italic"' : "";
  return ` font-family="${family}" font-weight="${escapeAttribute(String(font.weight))}"${style}`;
}

function runSpans(node: TextNode, run: TextRun, baseline: number): string {
  const font = run.font === node.font ? "" : fontAttributes(run.font);
  const spans: string[] = [];
  let pending: PlacedGlyph[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    const xs = pending.map((glyph) => formatNumber(node.x + glyph.x)).join(" ");
    const ys = pending.some((glyph) => glyph.y !== 0)
      ? pending.map((glyph) => formatNumber(baseline - glyph.y)).join(" ")
      : formatNumber(baseline);
    const text = pending.map((glyph) => escapeText(String.fromCodePoint(glyph.codePoint))).join("");
    spans.push(`<tspan${font} x="${xs}" y="${ys}">${text}</tspan>`);
    pending = [];
  };
  for (const glyph of run.glyphs) {
    if (glyph.codePoint > 0xffff) {
      flush();
      pending.push(glyph);
      flush();
    } else {
      pending.push(glyph);
    }
  }
  flush();
  return spans.join("");
}
