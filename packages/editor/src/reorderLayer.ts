import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, setAt, splitPointer } from "./designPointer.js";
import { withoutSelection, type EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";

/**
 * Moves the layer at `pointer` to `index` among its siblings (later ones are drawn on top). A selection in the moved
 * layer follows it; one in another sibling is cleared.
 */
export function reorderLayer(state: EditorState, pointer: string, index: number): EditorState {
  const split = splitPointer(pointer);
  const siblings = split === undefined ? undefined : getAt(state.design, split.parent);
  if (
    split === undefined ||
    !Array.isArray(siblings) ||
    findLayer(state.design, pointer) === undefined
  ) {
    return refuse(state, "design", "no layer to reorder", pointer);
  }
  const from = Number(split.key);
  if (!Number.isInteger(index) || index < 0 || index >= siblings.length) {
    return refuse(
      state,
      "design",
      `a layer here can move to positions 0 to ${String(siblings.length - 1)}`,
      pointer,
    );
  }
  if (index === from) return { ...state, issues: [] };
  const order = siblings.filter((_, at) => at !== from);
  order.splice(index, 0, siblings[from]);
  const next = setAt(state.design, split.parent, order);
  const moved = childPointer(split.parent, index);
  const selection = state.selection;
  if (selection === undefined) return commitDesign(state, next);
  if (selection === pointer || selection.startsWith(`${pointer}/`)) {
    return commitDesign(state, next, { selection: moved + selection.slice(pointer.length) });
  }
  // Every sibling between the old and the new place moves: a selection among them would point elsewhere.
  if (selection.startsWith(`${split.parent}/`)) return commitDesign(withoutSelection(state), next);
  return commitDesign(state, next);
}
