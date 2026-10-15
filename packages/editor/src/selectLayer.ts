import { refuse } from "./commitDesign.js";
import { withoutSelection, type EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";

/** Selects the layer at `pointer`, or clears the selection. */
export function selectLayer(state: EditorState, pointer: string | undefined): EditorState {
  if (pointer === undefined) return { ...withoutSelection(state), issues: [] };
  if (findLayer(state.design, pointer) === undefined) {
    return refuse(state, "design", "no layer to select", pointer);
  }
  return { ...state, selection: pointer, issues: [] };
}
