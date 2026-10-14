import { ValueRanges, type TextLayer } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { selectFont } from "./loadFont.js";
import { measureText, type TextMeasure } from "./measureText.js";
import { resolvePaint } from "./paint.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { TextNode } from "./RenderNode.js";
import { resolveBase } from "./resolveBase.js";
import { resolveStyle } from "./resolveStyle.js";
import { stripXmlInvalid } from "./stripXmlInvalid.js";
import { evaluateText } from "./expressions.js";
import { resolveOptionalNumber } from "./resolveValue.js";
import { wrapText } from "./wrapText.js";

export const defaultFontSize = 16;
export const defaultLineHeight = 1.2;

/**
 * A text with its placeholders filled, its font chosen and its lines measured. The box is the explicit width (or
 * the widest line) by one line height per line; the first baseline sits half the leading plus the ascender below
 * the top.
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
  const content = interpolate(context, layer.content, pointer(path, "content"), scope);
  // Every UTF-16 unit is written as at least one byte (a dropped soft-break space or line break costs a <tspan>),
  // so the content is reserved before it is measured and wrapped.
  context.writer.reserve(content.length);
  const fontRef = resolveStyle(context, layer, path, "font");
  if (typeof fontRef.value !== "string") {
    context.fail(fontRef.path, "missing-asset", "a text needs a font (its own or its style's)");
  }
  const loaded = selectFont(context, fontRef.value, fontWeight, fontRef.path);
  const measure: TextMeasure = {
    font: loaded.font,
    fontSize,
    letterSpacing,
    advances: new Map(),
  };
  const lines = wrapText(content, width, (text) => measureText(text, measure));
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, measureText(line, measure));
  const scale = fontSize / loaded.font.unitsPerEm;
  const lineAdvance = lineHeight * fontSize;
  const glyphHeight = (loaded.font.ascender - loaded.font.descender) * scale;
  return {
    kind: "text",
    ...base,
    width: width ?? widest,
    height: lines.length * lineAdvance,
    lines,
    font: loaded,
    fontSize,
    letterSpacing,
    align: align.value === "middle" || align.value === "end" ? align.value : "start",
    fill: resolvePaint(context, fill.value, fill.path, scope),
    baseline: (lineAdvance - glyphHeight) / 2 + loaded.font.ascender * scale,
    lineAdvance,
  };
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
