import type { Layer } from "@readmint/format";
import { appendLayer } from "./appendLayer.js";
import { refuse } from "./commitDesign.js";
import type { EditorState } from "./EditorState.js";
import { layerIds, uniqueId } from "./layerAccess.js";

/** Layer types the toolbar adds empty; images come from `uploadImage`, paths and components from imported designs. */
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
  return appendLayer(state, design, layer, parent);
}
