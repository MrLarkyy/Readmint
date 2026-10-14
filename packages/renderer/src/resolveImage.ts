import { ValueRanges, type ImageLayer } from "@readmint/format";
import type { RenderScope } from "./ExpressionEvaluator.js";
import { loadImage } from "./loadImage.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { ImageNode } from "./RenderNode.js";
import { resolveBase } from "./resolveBase.js";
import { resolveNumber } from "./resolveValue.js";

export function resolveImage(
  context: RenderContext,
  layer: ImageLayer,
  path: string,
  scope: RenderScope,
): ImageNode {
  const base = resolveBase(context, layer, path, scope);
  return {
    kind: "image",
    ...base,
    width: resolveNumber(context, layer.width, pointer(path, "width"), ValueRanges.size, scope),
    height: resolveNumber(context, layer.height, pointer(path, "height"), ValueRanges.size, scope),
    image: loadImage(context, layer.asset, pointer(path, "asset")),
    fit: layer.fit ?? "contain",
    alt: layer.alt,
  };
}
