import { ValueRanges, type Layer } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { NodeBase } from "./RenderNode.js";
import { resolveStyle } from "./resolveStyle.js";
import { resolveOptionalNumber } from "./resolveValue.js";

/** Position, opacity (own or from the style) and rotation every layer kind shares. */
export function resolveBase(
  context: RenderContext,
  layer: Layer,
  path: string,
  scope: Scope,
): Omit<NodeBase, "width" | "height"> {
  const opacity = resolveStyle(context, layer, path, "opacity");
  return {
    path,
    x:
      resolveOptionalNumber(context, layer.x, pointer(path, "x"), ValueRanges.position, scope) ?? 0,
    y:
      resolveOptionalNumber(context, layer.y, pointer(path, "y"), ValueRanges.position, scope) ?? 0,
    opacity: resolveOptionalNumber(context, opacity.value, opacity.path, ValueRanges.unit, scope),
    rotation: resolveOptionalNumber(
      context,
      layer.rotation,
      pointer(path, "rotation"),
      ValueRanges.rotation,
      scope,
    ),
  };
}
