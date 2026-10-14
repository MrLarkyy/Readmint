import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";

/** Counts the image nodes per distinct data into `context.imageUses`, group children included, before any is drawn. */
export function countImageUses(context: RenderContext, nodes: readonly RenderNode[]): void {
  for (const node of nodes) {
    if (node.kind === "image") {
      const { dataKey } = node.image;
      context.imageUses.set(dataKey, (context.imageUses.get(dataKey) ?? 0) + 1);
    } else if (node.kind === "group") countImageUses(context, node.children);
  }
}
