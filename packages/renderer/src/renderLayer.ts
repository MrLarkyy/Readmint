import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { renderGroup } from "./renderGroup.js";
import { renderImage } from "./renderImage.js";
import { renderEllipse, renderPath, renderRect } from "./renderShape.js";
import { renderText } from "./renderText.js";

/** Writes one node; layer ids and names are never emitted. */
export function renderLayer(context: RenderContext, node: RenderNode): void {
  switch (node.kind) {
    case "group":
      renderGroup(context, node);
      return;
    case "rect":
      renderRect(context.writer, node);
      return;
    case "ellipse":
      renderEllipse(context.writer, node);
      return;
    case "path":
      renderPath(context.writer, node);
      return;
    case "text":
      renderText(context.writer, node);
      return;
    case "image":
      renderImage(context, node);
      return;
  }
}
