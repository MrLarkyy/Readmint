import { renderVariant } from "@readmint/format";
import { refuse } from "./commitDesign.js";
import type { EditorState } from "./EditorState.js";
import { variantReason } from "./variantDesign.js";

/**
 * Renders with the named variant (`dark`), or with none (`undefined`). The design and its history are untouched. An
 * unknown name, or a design that declares none of the variant's props, is refused.
 */
export function setVariant(state: EditorState, name: string | undefined): EditorState {
  if (name === undefined) {
    const copy: { -readonly [K in keyof EditorState]: EditorState[K] } = { ...state, issues: [] };
    delete copy.variant;
    return copy;
  }
  const variant = renderVariant(name);
  if (variant === undefined) {
    return refuse(state, "variant", `unknown variant ${JSON.stringify(name.slice(0, 64))}`);
  }
  const reason = variantReason(state.design, variant);
  if (reason !== undefined) return refuse(state, "variant", reason);
  return { ...state, variant, issues: [] };
}
