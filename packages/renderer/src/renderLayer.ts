import { renderAnimated } from "./renderAnimated.js";
import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { renderGroup } from "./renderGroup.js";
import { renderImage } from "./renderImage.js";
import { renderEllipse, renderPath, renderRect } from "./renderShape.js";
import { renderText } from "./renderText.js";

/** Writes one node; layer ids and names are never emitted. */
export function renderLayer(context: RenderContext, node: RenderNode): void {
  if (node.animation === undefined) drawNode(context, node, "");
  else renderAnimated(context, node, node.animation, drawNode);
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
      renderText(context.writer, node, extra);
      return;
    case "image":
      renderImage(context, node, extra);
      return;
  }
}
