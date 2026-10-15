import { ShapingBudget } from "@readmint/fonts";
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
import { exceedsCodePoints } from "./exceedsCodePoints.js";
import { resolveOptionalNumber } from "./resolveValue.js";
import { privateCode } from "./privateCode.js";
import type { PlacedGlyph, TextLine, TextRun } from "./TextLine.js";
import type { TextLayout } from "./TextLayout.js";
import { TextShaper, type ShapedLine, type TextShaperOptions } from "./TextShaper.js";
import { wrapParagraphs } from "./wrapText.js";

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
  const { lines, drawnAs, privateUse, rtl } = layout;
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
    privateUse,
    rtl,
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
  // One shaping budget for the whole text, shared by every word and line: words are shaped to measure them and again
  // as lines, so it allows two passes, max(16384, 64 x twice its length).
  const shaper = new TextShaper(context, options, ShapingBudget.forText(2 * content.length));
  const paragraphs = wrapParagraphs(
    content,
    width,
    (text) => shaper.measure(text),
    (word) => shaper.clusters(word),
  );
  const shaped = paragraphs.flatMap((paragraph) => {
    const bidi = shaper.paragraph(paragraph.text);
    return paragraph.lines.map((line) => shaper.layout(paragraph.text, bidi, line.start, line.end));
  });
  let widest = 0;
  for (const line of shaped) widest = Math.max(widest, line.width);
  const boxWidth = width ?? widest;
  const drawnAs = shaped.some((line) => line.glyphs.some((glyph) => glyph.font?.drawAs === "paths"))
    ? "paths"
    : "font";
  const lines = shaped.map((line) => placeLine(context, line, boxWidth, alignment, drawnAs));
  record(context, lines, drawnAs);
  for (const line of shaped) {
    for (const glyph of line.glyphs) {
      if (glyph.font !== undefined) continue;
      for (const char of glyph.text) {
        const codePoint = char.codePointAt(0) ?? 0;
        if (shaper.lacks(codePoint)) {
          context.missingGlyphs.note(options.referenced, codePoint, contentPath);
        }
      }
    }
  }
  const drawn = shaped.flatMap((line) => line.glyphs.filter((glyph) => glyph.font !== undefined));
  return {
    lines,
    width: boxWidth,
    drawnAs,
    privateUse: drawnAs === "font" && drawn.some((glyph) => !glyph.plain),
    rtl: drawn.some((glyph) => glyph.rtl),
  };
}

/**
 * Moves a line by its alignment in the box (start and end follow the paragraph's direction) and groups its drawn
 * glyphs into runs of one font. In font mode a glyph its own character does not draw gets the private-use character
 * of its font (`privateCode`), assigned here once per cached layout, in layout order. Without an offset a glyph
 * written as its own character is placed as shaped (no copy per glyph).
 */
function placeLine(
  context: RenderContext,
  line: ShapedLine,
  boxWidth: number,
  align: Align,
  drawnAs: "font" | "paths",
): TextLine {
  const free = boxWidth - line.width;
  const offset = align === "middle" ? free / 2 : (align === "end") !== line.rtl ? free : 0;
  const runs: TextRun[] = [];
  let current: { font: TextRun["font"]; glyphs: PlacedGlyph[] } | undefined;
  for (const glyph of line.glyphs) {
    if (glyph.font === undefined) continue;
    if (current?.font !== glyph.font) {
      current = { font: glyph.font, glyphs: [] };
      runs.push(current);
    }
    const codePoint =
      drawnAs === "font" && !glyph.plain
        ? privateCode(context.useFont(glyph.font), glyph.glyph)
        : glyph.codePoint;
    current.glyphs.push(
      offset === 0 && codePoint === glyph.codePoint
        ? glyph
        : { glyph: glyph.glyph, codePoint, x: offset + glyph.x, y: glyph.y },
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
  if (exceedsCodePoints(text, max)) {
    context.fail(
      path,
      "too-large",
      `the text is longer than ${String(max)} characters after filling placeholders`,
    );
  }
  // Removed before reserving, wrapping and measuring, so what is laid out is exactly what is written.
  return stripXmlInvalid(text);
}
