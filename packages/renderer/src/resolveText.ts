import { ValueRanges, type TextLayer } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { selectFont } from "./loadFont.js";
import { resolvePaint } from "./paint.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { TextNode } from "./RenderNode.js";
import { resolveBase } from "./resolveBase.js";
import { resolveStyle } from "./resolveStyle.js";
import { stripXmlInvalid } from "./stripXmlInvalid.js";
import { evaluateText } from "./expressions.js";
import { resolveOptionalNumber } from "./resolveValue.js";
import type { TextLine, TextRun } from "./TextLine.js";
import type { TextLayout } from "./TextLayout.js";
import { TextShaper, type ShapedGlyph, type TextShaperOptions } from "./TextShaper.js";
import { wrapText } from "./wrapText.js";

export const defaultFontSize = 16;
export const defaultLineHeight = 1.2;

type Align = "start" | "middle" | "end";

/**
 * A text with its placeholders filled, its fonts chosen per character and every glyph placed. The box is the
 * explicit width (or the widest line) by one line height per line; the first baseline sits half the leading plus
 * the ascender below the top. The glyphs each font draws are recorded for subsetting.
 */
export function resolveText(
  context: RenderContext,
  layer: TextLayer,
  path: string,
  scope: Scope,
): TextNode {
  const base = resolveBase(context, layer, path, scope);
  const number = (key: "fontSize" | "lineHeight" | "letterSpacing", fallback: number) => {
    const styled = resolveStyle(context, layer, path, key);
    return (
      resolveOptionalNumber(context, styled.value, styled.path, ValueRanges[key], scope) ?? fallback
    );
  };
  const fontSize = number("fontSize", defaultFontSize);
  const lineHeight = number("lineHeight", defaultLineHeight);
  const letterSpacing = number("letterSpacing", 0);
  const weight = resolveStyle(context, layer, path, "fontWeight");
  const fontWeight = resolveOptionalNumber(
    context,
    weight.value,
    weight.path,
    ValueRanges.fontWeight,
    scope,
  );
  const fill = resolveStyle(context, layer, path, "fill");
  const align = resolveStyle(context, layer, path, "align");
  const width = resolveOptionalNumber(
    context,
    layer.width,
    pointer(path, "width"),
    ValueRanges.size,
    scope,
  );
  const contentPath = pointer(path, "content");
  const content = interpolate(context, layer.content, contentPath, scope);
  // Every UTF-16 unit is written as at least one byte (a dropped soft-break space or line break costs a <tspan>),
  // so the content is reserved before it is measured and wrapped.
  context.writer.reserve(content.length);
  const fontRef = resolveStyle(context, layer, path, "font");
  if (typeof fontRef.value !== "string") {
    context.fail(fontRef.path, "missing-asset", "a text needs a font (its own or its style's)");
  }
  const primary = selectFont(context, fontRef.value, fontWeight, fontRef.path);
  const alignment: Align =
    align.value === "middle" || align.value === "end" ? align.value : "start";
  const key = JSON.stringify([
    primary.asset,
    fontRef.value,
    fontWeight ?? null,
    fontSize,
    letterSpacing,
    width ?? null,
    alignment,
    content,
  ]);
  let layout = context.textLayouts.get(key);
  if (layout === undefined) {
    layout = layOut(
      context,
      content,
      width,
      alignment,
      {
        referenced: fontRef.value,
        primary,
        weight: fontWeight,
        fontSize,
        letterSpacing,
      },
      contentPath,
    );
    context.textLayouts.set(key, layout);
  }
  const { lines, drawnAs } = layout;
  const scale = fontSize / primary.font.unitsPerEm;
  const lineAdvance = lineHeight * fontSize;
  const glyphHeight = (primary.font.ascender - primary.font.descender) * scale;
  return {
    kind: "text",
    ...base,
    width: layout.width,
    height: lines.length * lineAdvance,
    text: content,
    lines,
    font: primary,
    fontSize,
    drawnAs,
    fill: resolvePaint(context, fill.value, fill.path, scope),
    baseline: (lineAdvance - glyphHeight) / 2 + primary.font.ascender * scale,
    lineAdvance,
  };
}

/** Shapes, wraps and places a text, recording the glyphs each font draws and the characters none has. */
function layOut(
  context: RenderContext,
  content: string,
  width: number | undefined,
  alignment: Align,
  options: TextShaperOptions,
  contentPath: string,
): TextLayout {
  const shaper = new TextShaper(context, options);
  const shaped = wrapText(content, width, (text) => shaper.measure(text)).map((line) =>
    shaper.layout(line),
  );
  let widest = 0;
  for (const line of shaped) widest = Math.max(widest, line.width);
  const boxWidth = width ?? widest;
  const missing: number[] = [];
  const lines = shaped.map((line) => placeLine(line, boxWidth, alignment, missing));
  const drawnAs = lines.some((line) => line.runs.some((run) => run.font.drawAs === "paths"))
    ? "paths"
    : "font";
  record(context, lines, drawnAs);
  for (const codePoint of missing) {
    context.missingGlyphs.note(options.referenced, codePoint, contentPath);
  }
  return { lines, width: boxWidth, drawnAs };
}

/**
 * Moves a line by its alignment in the box and groups its drawn glyphs into runs of one font; code points no font has
 * go to `missing`. Without an offset the shaped glyphs are the placed ones (no copy per glyph).
 */
function placeLine(
  line: { width: number; glyphs: readonly ShapedGlyph[] },
  boxWidth: number,
  align: Align,
  missing: number[],
): TextLine {
  const offset =
    align === "start"
      ? 0
      : align === "middle"
        ? (boxWidth - line.width) / 2
        : boxWidth - line.width;
  const runs: TextRun[] = [];
  let current: { font: TextRun["font"]; glyphs: TextRun["glyphs"][number][] } | undefined;
  for (const glyph of line.glyphs) {
    if (glyph.font === undefined) {
      missing.push(glyph.codePoint);
      continue;
    }
    if (current?.font !== glyph.font) {
      current = { font: glyph.font, glyphs: [] };
      runs.push(current);
    }
    current.glyphs.push(
      offset === 0
        ? glyph
        : { glyph: glyph.glyph, codePoint: glyph.codePoint, x: offset + glyph.x },
    );
  }
  return { width: line.width, runs };
}

/** Notes every drawn glyph per font; glyphs drawn with an embedded font also go into its subset. */
function record(
  context: RenderContext,
  lines: readonly TextLine[],
  drawnAs: "font" | "paths",
): void {
  for (const line of lines) {
    for (const run of line.runs) {
      const use = context.useFont(run.font);
      for (const { glyph, codePoint } of run.glyphs) {
        use.glyphs.add(glyph);
        if (drawnAs === "font") use.embedded.set(codePoint, glyph);
      }
    }
  }
}

function interpolate(context: RenderContext, content: string, path: string, scope: Scope): string {
  const text = evaluateText(context, content, path, scope);
  const max = context.limits.maxTextLength;
  if (text.length > max) {
    context.fail(
      path,
      "too-large",
      `the text is ${String(text.length)} characters long after filling placeholders; at most ${String(max)} are allowed`,
    );
  }
  // Removed before reserving, wrapping and measuring, so what is laid out is exactly what is written.
  return stripXmlInvalid(text);
}
