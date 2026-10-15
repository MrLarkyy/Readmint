import type { Design, Layer } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, setAt } from "./designPointer.js";
import type { EditorIssueSource } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";

/**
 * `design` with `layer` appended to the top level, or to the children of the group at `parent`, committed and the
 * layer selected; issues are reported under `source`. `design` is the state's design or one a command already changed
 * (an upload adds its asset), so the asset and the layer are one edit.
 */
export function appendLayer(
  state: EditorState,
  design: Design,
  layer: Layer,
  parent?: string,
  source: EditorIssueSource = "design",
): EditorState {
  let list = "/layers";
  if (parent !== undefined) {
    if (findLayer(design, parent)?.type !== "group") {
      return refuse(state, source, "layers can only be added to a group", parent);
    }
    list = childPointer(parent, "children");
  }
  const found = getAt(design, list);
  const siblings: readonly unknown[] = Array.isArray(found) ? found : [];
  const next = setAt(design, list, [...siblings, layer]);
  return commitDesign(state, next, { selection: childPointer(list, siblings.length) }, source);
}
