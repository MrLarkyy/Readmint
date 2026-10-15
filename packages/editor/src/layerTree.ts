import type { Design, Layer } from "@readmint/format";
import { childPointer } from "./designPointer.js";

/** One row of the layer tree, in document order (later rows are drawn over earlier ones at the same depth). */
export interface LayerTreeItem {
  readonly pointer: string;
  /** The layer's name, else its id, else its type. */
  readonly label: string;
  readonly type: Layer["type"];
  /** 0 for a top-level layer, one more per group. */
  readonly depth: number;
  /** Its position among its siblings, and how many there are. */
  readonly index: number;
  readonly siblings: number;
}

/** The design's layers and the children of its groups as rows; component definitions are not listed. */
export function layerTree(design: Design): LayerTreeItem[] {
  const rows: LayerTreeItem[] = [];
  const visit = (layers: readonly Layer[], list: string, depth: number) => {
    layers.forEach((layer, index) => {
      const pointer = childPointer(list, index);
      rows.push({
        pointer,
        label: layer.name ?? layer.id ?? layer.type,
        type: layer.type,
        depth,
        index,
        siblings: layers.length,
      });
      if (layer.type === "group")
        visit(layer.children, childPointer(pointer, "children"), depth + 1);
    });
  };
  visit(design.layers, "/layers", 0);
  return rows;
}
