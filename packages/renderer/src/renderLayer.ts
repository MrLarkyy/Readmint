import { inkBounds } from "./inkBounds.js";
import { renderAnimated } from "./renderAnimated.js";
import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { renderGroup } from "./renderGroup.js";
import { isSharedImage, renderImage } from "./renderImage.js";
import { renderEllipse, renderPath, renderRect } from "./renderShape.js";
import { renderText } from "./renderText.js";
import { renderTextPaths } from "./renderTextPaths.js";

/**
 * Writes one node; layer ids and names are never emitted. A node drawn as a layer of its own that lies wholly
 * outside the canvas is not written at all: it draws nothing in any viewer, and resvg 2.6.2 aborts on such a layer
 * once it lies beyond twice the canvas.
 */
export function renderLayer(context: RenderContext, node: RenderNode): void {
  if (
    isolated(context, node) &&
    context.placement.isOutside(inkBounds(node, context.time, context.inkBounds))
  ) {
    return;
  }
  if (node.animation === undefined) drawNode(context, node, "");
  else renderAnimated(context, node, node.animation, drawNode);
}

/** Drawn as a layer of its own (resvg's isolated group): an opacity, a clip, or the viewport of a `<symbol>`. */
function isolated(context: RenderContext, node: RenderNode): boolean {
  if (node.opacity !== undefined) return true;
  if (node.kind === "group" && node.clip) return true;
  if (node.kind === "image" && isSharedImage(context, node)) return true;
  return (
    context.time !== undefined &&
    node.animation?.tracks.some((track) => track.property === "opacity") === true
  );
}

/** The node's own markup; `extra` (animation attributes) ends its start tag. */
function drawNode(context: RenderContext, node: RenderNode, extra: string): void {
  switch (node.kind) {
    case "group":
      renderGroup(context, node, extra);
      return;
    case "rect":
      renderRect(context.writer, node, extra);
      return;
    case "ellipse":
      renderEllipse(context.writer, node, extra);
      return;
    case "path":
      renderPath(context.writer, node, extra);
      return;
    case "text":
      if (node.drawnAs === "paths") renderTextPaths(context, node, extra);
      else renderText(context.writer, node, extra);
      return;
    case "image":
      renderImage(context, node, extra);
      return;
  }
}
