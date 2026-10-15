import type { Layer } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { wholePosition, wholeSize } from "./geometry.js";
import { findLayer, placedByLayout } from "./layerAccess.js";

/** The box a resize ends with, in the layer's own coordinates; a missing value stays as it is. */
export interface LayerResize {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Gives the layer at `pointer` a new box, written as whole numbers (sizes at least 1). A path keeps its size (its
 * data is its shape), a text sets only its wrapping `width`; a layout-placed layer keeps its `x`/`y`; a value bound
 * to data is never changed: the command is refused.
 */
export function resizeLayer(state: EditorState, pointer: string, box: LayerResize): EditorState {
  const layer = findLayer(state.design, pointer);
  if (layer === undefined) return refuse(state, "design", "no layer to resize", pointer);
  if (layer.type === "path") {
    return refuse(state, "design", "a path layer is resized by editing its data", pointer);
  }
  const keys: (keyof LayerResize)[] = layer.type === "text" ? ["width"] : ["width", "height"];
  if (!placedByLayout(state.design, pointer)) keys.push("x", "y");
  let design: unknown = state.design;
  for (const key of keys) {
    const wanted = box[key];
    if (wanted === undefined) continue;
    if (!Number.isFinite(wanted))
      return refuse(state, "design", `the ${key} is not a number`, pointer);
    const value = key === "x" || key === "y" ? wholePosition(wanted) : wholeSize(wanted);
    const current = own(layer, key);
    if (current === value) continue;
    if (typeof current === "string") {
      return refuse(
        state,
        "design",
        `${key} is bound to data and cannot be dragged`,
        childPointer(pointer, key),
      );
    }
    design = setAt(design, childPointer(pointer, key), value);
  }
  return commitDesign(state, design);
}

function own(layer: Layer, key: keyof LayerResize): unknown {
  return Object.hasOwn(layer, key) ? (layer as unknown as Record<string, unknown>)[key] : undefined;
}
