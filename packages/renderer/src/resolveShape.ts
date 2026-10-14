import {
  ValueRanges,
  type EllipseLayer,
  type Layer,
  type PathLayer,
  type RectLayer,
} from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { resolvePaint } from "./paint.js";
import { pathBounds } from "./pathBounds.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { EllipseNode, PathNode, RectNode, ShapeStyle } from "./RenderNode.js";
import { resolveBase } from "./resolveBase.js";
import { resolveStyle } from "./resolveStyle.js";
import { resolveNumber, resolveOptionalNumber } from "./resolveValue.js";

export function resolveShapeStyle(
  context: RenderContext,
  layer: Layer,
  path: string,
  scope: Scope,
): ShapeStyle {
  const fill = resolveStyle(context, layer, path, "fill");
  const stroke = resolveStyle(context, layer, path, "stroke");
  const strokeWidth = resolveStyle(context, layer, path, "strokeWidth");
  return {
    fill: resolvePaint(context, fill.value, fill.path, scope),
    stroke: resolvePaint(context, stroke.value, stroke.path, scope),
    strokeWidth: resolveOptionalNumber(
      context,
      strokeWidth.value,
      strokeWidth.path,
      ValueRanges.strokeWidth,
      scope,
    ),
  };
}

function size(
  context: RenderContext,
  layer: RectLayer | EllipseLayer,
  path: string,
  scope: Scope,
): { width: number; height: number } {
  return {
    width: resolveNumber(context, layer.width, pointer(path, "width"), ValueRanges.size, scope),
    height: resolveNumber(context, layer.height, pointer(path, "height"), ValueRanges.size, scope),
  };
}

export function resolveRect(
  context: RenderContext,
  layer: RectLayer,
  path: string,
  scope: Scope,
): RectNode {
  return {
    kind: "rect",
    ...resolveBase(context, layer, path, scope),
    ...size(context, layer, path, scope),
    radius: resolveOptionalNumber(
      context,
      layer.radius,
      pointer(path, "radius"),
      ValueRanges.length,
      scope,
    ),
    ...resolveShapeStyle(context, layer, path, scope),
  };
}

export function resolveEllipse(
  context: RenderContext,
  layer: EllipseLayer,
  path: string,
  scope: Scope,
): EllipseNode {
  return {
    kind: "ellipse",
    ...resolveBase(context, layer, path, scope),
    ...size(context, layer, path, scope),
    ...resolveShapeStyle(context, layer, path, scope),
  };
}

/** Whitespace the format's `\s` accepts but SVG path data does not (VT, FF, NBSP, U+2028, U+FEFF, ...). */
const nonSvgWhitespace = /[^\S \t\n\r]/gu;

/**
 * The layout box of a path runs from its origin to the furthest point of its data. Whitespace SVG does not know
 * becomes a space: one UTF-16 unit for one, so the data keeps its meaning, its bounds and its reserved length.
 */
export function resolvePath(
  context: RenderContext,
  layer: PathLayer,
  path: string,
  scope: Scope,
): PathNode {
  const d = layer.d.replace(nonSvgWhitespace, " ");
  let bounds = context.pathBounds.get(path);
  if (!context.pathBounds.has(path)) {
    bounds = pathBounds(d);
    context.pathBounds.set(path, bounds);
  }
  return {
    kind: "path",
    ...resolveBase(context, layer, path, scope),
    width: Math.max(0, bounds?.maxX ?? 0),
    height: Math.max(0, bounds?.maxY ?? 0),
    d,
    ...resolveShapeStyle(context, layer, path, scope),
  };
}
