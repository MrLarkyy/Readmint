import { escapeCssString } from "./escapeCssString.js";
import { escapeAttribute, escapeText } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import { paintAttributes } from "./paint.js";
import type { TextNode } from "./RenderNode.js";
import type { SvgWriter } from "./SvgWriter.js";

/**
 * One `<text>` with a `<tspan>` per line. Alignment is left to the drawer (`text-anchor` at the start, middle or
 * end of the box), so a small difference between measured and drawn widths never shifts the alignment.
 * `xml:space="preserve"` keeps the spaces the measurement counted. `text-rendering="geometricPrecision"` stops
 * Chromium on Linux from rounding hinted glyph advances to whole pixels, which drew text wider than measured.
 */
export function renderText(writer: SvgWriter, node: TextNode, extra = ""): void {
  const anchorX =
    node.align === "start"
      ? node.x
      : node.align === "middle"
        ? node.x + node.width / 2
        : node.x + node.width;
  const family = escapeAttribute(`'${escapeCssString(node.font.family)}'`);
  const spacing =
    node.letterSpacing === 0 ? "" : ` letter-spacing="${formatNumber(node.letterSpacing)}"`;
  const anchor = node.align === "start" ? "" : ` text-anchor="${node.align}"`;
  // The face's own style, matching its @font-face rule; without it an italic face would draw as the regular one.
  const style = node.font.style === "italic" ? ' font-style="italic"' : "";
  const x = formatNumber(anchorX);
  const lines = node.lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${formatNumber(node.y + node.baseline + index * node.lineAdvance)}">${escapeText(line)}</tspan>`,
    )
    .join("");
  writer.write(
    `<text xml:space="preserve" text-rendering="geometricPrecision" font-family="${family}" font-size="${formatNumber(node.fontSize)}" font-weight="${escapeAttribute(String(node.font.weight))}"${style}${spacing}${anchor}${paintAttributes(writer, "fill", node.fill)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}>${lines}</text>`,
  );
}
