import { commitDesign } from "./commitDesign.js";
import { getAt, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { sameJson } from "./sameJson.js";

/**
 * Sets the design's timeline (`animation`: duration and loop) or removes it with `undefined`; only `animation`
 * changes. The format's validation checks the duration range and refuses removing it while a layer animates. An
 * equal timeline changes nothing. Refused, the state is unchanged and the issue says why.
 */
export function setTimeline(state: EditorState, animation: unknown): EditorState {
  if (sameJson(animation, getAt(state.design, "/animation"))) {
    return commitDesign(state, state.design);
  }
  return commitDesign(state, setAt(state.design, "/animation", animation));
}
