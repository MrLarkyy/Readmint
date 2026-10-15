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
 * character, so the drawer places each glyph where the renderer did (no shaping, kerning or alignment of its own).
 * A character above the BMP gets a `<tspan>` of its own, since drawers count `x` values in UTF-16 units or in code
 * points. `xml:space="preserve"` keeps the spaces; `text-rendering="geometricPrecision"` stops Chromium on Linux
 * from rounding glyphs to hinted whole pixels.
 */
export function renderText(writer: SvgWriter, node: TextNode, extra = ""): void {
  const spans = node.lines
    .map((line, index) => {
      const y = formatNumber(node.y + node.baseline + index * node.lineAdvance);
      return line.runs.map((run) => runSpans(node, run, y)).join("");
    })
    .join("");
  const box = { x: node.x, y: node.y, width: node.width, height: node.height };
  writer.write(
    `<text xml:space="preserve" text-rendering="geometricPrecision"${fontAttributes(node.font)} font-size="${formatNumber(node.fontSize)}"${paintAttributes(writer, "fill", node.fill, box)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}>${spans}</text>`,
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

function runSpans(node: TextNode, run: TextRun, y: string): string {
  const font = run.font === node.font ? "" : fontAttributes(run.font);
  const spans: string[] = [];
  let pending: PlacedGlyph[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    const xs = pending.map((glyph) => formatNumber(node.x + glyph.x)).join(" ");
    const text = pending.map((glyph) => escapeText(String.fromCodePoint(glyph.codePoint))).join("");
    spans.push(`<tspan${font} x="${xs}" y="${y}">${text}</tspan>`);
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
