import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, parsePointer, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";

/**
 * Sets one property of the layer (or of `/canvas`, or another design object) at `pointer`; `undefined` removes it.
 * The result must validate, else the state is unchanged and the issues say why.
 */
export function setLayerProperty(
  state: EditorState,
  pointer: string,
  key: string,
  value: unknown,
): EditorState {
  const target = getAt(state.design, pointer);
  const path = childPointer(pointer, key);
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return refuse(state, "design", "nothing to change here", pointer);
  }
  if (parsePointer(path) === undefined || key === "") {
    return refuse(
      state,
      "design",
      `the property name ${JSON.stringify(key)} is not allowed`,
      pointer,
    );
  }
  if (key === "type" || key === "children") {
    return refuse(state, "design", `${key} is not edited as a property`, path);
  }
  return commitDesign(state, setAt(state.design, path, value));
}
