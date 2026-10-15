import { commitDesign, refuse } from "./commitDesign.js";
import { setAt } from "./designPointer.js";
import { withoutSelection, type EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";

/** Removes the layer at `pointer` with its children; the selection is cleared, its pointer may have moved. */
export function removeLayer(state: EditorState, pointer: string): EditorState {
  if (findLayer(state.design, pointer) === undefined) {
    return refuse(state, "design", "no layer to remove", pointer);
  }
  const next = setAt(state.design, pointer, undefined);
  return commitDesign(withoutSelection(state), next);
}
