import type { GlyphOutline } from "@readmint/fonts";
import { escapeAttribute } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import type { LoadedFont } from "./loadFont.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import { paintAttributes } from "./paint.js";
import type { RenderContext } from "./RenderContext.js";
import type { TextNode } from "./RenderNode.js";
import { withFont } from "./withFont.js";

/**
 * Text drawn as one `<path>`: every glyph's outline placed where the renderer laid it out (marks off the baseline
 * included), so nothing of the font is embedded and every drawer shows the same shapes. The text stays readable to assistive technology through
 * `aria-label`. The path data is checked against the output budget glyph by glyph while it is built, so a long text
 * stops early instead of building megabytes first.
 */
export function renderTextPaths(context: RenderContext, node: TextNode, extra = ""): void {
  const pieces: string[] = [];
  let length = 0;
  node.lines.forEach((line, index) => {
    const baseline = node.y + node.baseline + index * node.lineAdvance;
    for (const run of line.runs) {
      const scale = node.fontSize / run.font.font.unitsPerEm;
      const use = context.useFont(run.font);
      for (const glyph of run.glyphs) {
        const piece = pathData(
          outlineOf(context, run.font, glyph.glyph),
          node.x + glyph.x,
          glyph.y === 0 ? baseline : baseline - glyph.y,
          scale,
        );
        length += piece.length;
        context.writer.ensureRoom(length);
        use.pathBytes += piece.length;
        pieces.push(piece);
      }
    }
  });
  if (length === 0) return;
  const box = { x: node.x, y: node.y, width: node.width, height: node.height };
  context.writer.write(
    `<path d="${pieces.join("")}" fill-rule="nonzero" aria-label="${escapeAttribute(node.text)}"${paintAttributes(context.writer, "fill", node.fill, box)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}/>`,
  );
}

function outlineOf(context: RenderContext, font: LoadedFont, glyph: number): GlyphOutline {
  const key = `${font.asset}\u0000${String(glyph)}`;
  let outline = context.outlines.get(key);
  if (outline === undefined) {
    outline = withFont(context, font, () => font.font.outline(glyph, context.outlineBudget));
    context.outlines.set(key, outline);
  }
  return outline;
}

/** Path data of an outline in font units (y up) placed with its origin at `x`, `baseline` (y down). */
function pathData(outline: GlyphOutline, x: number, baseline: number, scale: number): string {
  const px = (value: number) => formatNumber(x + value * scale);
  const py = (value: number) => formatNumber(baseline - value * scale);
  let data = "";
  for (const command of outline) {
    switch (command.type) {
      case "M":
      case "L":
        data += `${command.type}${px(command.x)} ${py(command.y)}`;
        break;
      case "Q":
        data += `Q${px(command.x1)} ${py(command.y1)} ${px(command.x)} ${py(command.y)}`;
        break;
      case "C":
        data += `C${px(command.x1)} ${py(command.y1)} ${px(command.x2)} ${py(command.y2)} ${px(command.x)} ${py(command.y)}`;
        break;
      case "Z":
        data += "Z";
        break;
    }
  }
  return data;
}
