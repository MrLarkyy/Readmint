import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";

/** Counts the image nodes per data URI into `context.imageUses`, group children included, before any is drawn. */
export function countImageUses(context: RenderContext, nodes: readonly RenderNode[]): void {
  for (const node of nodes) {
    if (node.kind === "image") {
      const { dataUri } = node.image;
      context.imageUses.set(dataUri, (context.imageUses.get(dataUri) ?? 0) + 1);
    } else if (node.kind === "group") countImageUses(context, node.children);
  }
}
