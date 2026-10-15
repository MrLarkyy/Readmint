import type { Layer } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { findLayer, layerIds, uniqueId } from "./layerAccess.js";

/** Layer types the editor creates; paths, images and components come from imported designs. */
export type NewLayerType = "rect" | "ellipse" | "text" | "group";

/**
 * Appends a new layer with a unique `id` to the top level, or to the children of the group at `parent`, and selects
 * it. A text takes the design's first font; without a font it is refused.
 */
export function addLayer(state: EditorState, type: NewLayerType, parent?: string): EditorState {
  const design = state.design;
  const id = uniqueId(type, layerIds(design));
  let layer: Layer;
  switch (type) {
    case "rect":
      layer = { type, id, x: 20, y: 20, width: 120, height: 60, fill: "#d0d7de" };
      break;
    case "ellipse":
      layer = { type, id, x: 20, y: 20, width: 60, height: 60, fill: "#8250df" };
      break;
    case "group":
      layer = { type, id, x: 20, y: 20, children: [] };
      break;
    case "text": {
      const font = Object.keys(design.assets?.fonts ?? {})[0];
      if (font === undefined) {
        return refuse(state, "design", "a text layer needs a font: upload a font first");
      }
      layer = { type, id, x: 20, y: 20, content: "Text", font, fontSize: 24, fill: "#1f2328" };
      break;
    }
  }
  let list = "/layers";
  if (parent !== undefined) {
    if (findLayer(design, parent)?.type !== "group") {
      return refuse(state, "design", "layers can only be added to a group", parent);
    }
    list = childPointer(parent, "children");
  }
  const found = getAt(design, list);
  const siblings: readonly unknown[] = Array.isArray(found) ? found : [];
  const next = setAt(design, list, [...siblings, layer]);
  return commitDesign(state, next, { selection: childPointer(list, siblings.length) });
}
