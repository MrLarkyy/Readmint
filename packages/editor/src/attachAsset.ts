import { refuse } from "./commitDesign.js";
import { childPointer } from "./designPointer.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";

/**
 * Gives the preview the bytes of a path-sourced asset for this session (what the CLI reads from the path). The design
 * keeps its path `src`, so the exported file renders the same with the file next to it. Checked for size here; the
 * renderer checks the format, as it does for the CLI.
 */
export function attachAsset(
  state: EditorState,
  kind: "fonts" | "images",
  id: string,
  bytes: Uint8Array,
): EditorState {
  const assets = state.design.assets?.[kind];
  const path = childPointer(`/assets/${kind}`, id);
  if (assets === undefined || !Object.hasOwn(assets, id)) {
    return refuse(state, "asset", "no such asset", path);
  }
  const max = kind === "fonts" ? EditorLimits.maxFontBytes : EditorLimits.maxImageBytes;
  if (bytes.length > max) {
    return refuse(
      state,
      "asset",
      `the file is ${String(bytes.length)} bytes, more than the ${String(max)} allowed`,
      path,
    );
  }
  const session = state.sessionAssets[kind] ?? {};
  return {
    ...state,
    sessionAssets: { ...state.sessionAssets, [kind]: { ...session, [id]: bytes } },
    issues: [],
  };
}
