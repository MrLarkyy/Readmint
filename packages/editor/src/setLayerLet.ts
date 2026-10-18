import { DesignLimits, LocalNames, quoteInput } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, getAt, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { findLayer } from "./layerAccess.js";
import { sameJson } from "./sameJson.js";

/** A layer's `let` as the panel edits it: names and expressions in evaluation order. */
export type LetEntries = readonly (readonly [string, string])[];

/**
 * Replaces the `let` of the layer at `pointer` with `entries` (an empty list removes it); only `let` changes, every
 * other property of the layer is kept as it is. The count is checked before any entry is read, names and expressions
 * against the format's limits before the object is built; the format's validation checks the rest. Refused, the state
 * is unchanged and the issue says why.
 */
export function setLayerLet(state: EditorState, pointer: string, entries: LetEntries): EditorState {
  const path = childPointer(pointer, "let");
  if (findLayer(state.design, pointer) === undefined) {
    return refuse(state, "design", "no layer to change here", pointer);
  }
  if (!Array.isArray(entries))
    return refuse(state, "design", "the let entries must be a list", path);
  if (entries.length > DesignLimits.maxLetEntries) {
    return refuse(
      state,
      "design",
      `a layer may have at most ${String(DesignLimits.maxLetEntries)} let entries`,
      path,
    );
  }
  const names = new Set<string>();
  for (const item of entries as readonly unknown[]) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      item.some((part) => typeof part !== "string")
    ) {
      return refuse(state, "design", "every let entry must be a name and an expression", path);
    }
    const [name, expression] = item as [string, string];
    if (names.has(name)) {
      return refuse(state, "design", `the let name ${quoteInput(name)} is used twice`, path);
    }
    names.add(name);
    if (name.length > LocalNames.maxLength) {
      return refuse(
        state,
        "design",
        `the let name ${quoteInput(name)} is longer than ${String(LocalNames.maxLength)} characters`,
        path,
      );
    }
    if (expression.length > DesignLimits.maxBindingLength) {
      return refuse(
        state,
        "design",
        `the expression of ${quoteInput(name)} is longer than ${String(DesignLimits.maxBindingLength)} characters`,
        childPointer(path, name),
      );
    }
  }
  const value = entries.length === 0 ? undefined : Object.fromEntries(entries);
  if (sameJson(value, getAt(state.design, path))) return commitDesign(state, state.design);
  return commitDesign(state, setAt(state.design, path, value));
}
