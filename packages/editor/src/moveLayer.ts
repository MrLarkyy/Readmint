import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { wholePosition } from "./geometry.js";
import { findLayer, placedByLayout } from "./layerAccess.js";

/**
 * Moves the layer at `pointer` by `dx`/`dy` in its own coordinates; the new `x`/`y` are whole numbers. A coordinate
 * bound to data, or a layer a stack or grid layout places, is never moved: the command is refused.
 */
export function moveLayer(
  state: EditorState,
  pointer: string,
  dx: number,
  dy: number,
): EditorState {
  const layer = findLayer(state.design, pointer);
  if (layer === undefined) return refuse(state, "design", "no layer to move", pointer);
  if (placedByLayout(state.design, pointer)) {
    return refuse(
      state,
      "design",
      "this layer is placed by its group's layout and cannot be dragged",
      pointer,
    );
  }
  let design: unknown = state.design;
  for (const [key, delta] of [
    ["x", dx],
    ["y", dy],
  ] as const) {
    if (!Number.isFinite(delta))
      return refuse(state, "design", `the ${key} change is not a number`, pointer);
    if (delta === 0) continue;
    const current = layer[key] ?? 0;
    if (typeof current !== "number") {
      return refuse(
        state,
        "design",
        `${key} is bound to data and cannot be dragged`,
        childPointer(pointer, key),
      );
    }
    design = setAt(design, childPointer(pointer, key), wholePosition(current + delta));
  }
  return commitDesign(state, design);
}
