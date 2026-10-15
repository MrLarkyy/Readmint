import { assetSourceKind } from "./assetSourceKind.js";
import { refuse } from "./commitDesign.js";
import { childPointer } from "./designPointer.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";

/**
 * Gives the preview the bytes of a path-sourced asset for this session (what the CLI reads from the path). The design
 * keeps its path `src`, so the exported file renders the same with the file next to it. Checked for size here; the
 * renderer checks the format, as it does for the CLI. An embedded (`data:`) or bound (`{{...}}`) asset is refused: the
 * CLI never reads a file for one, and the renderer would draw supplied bytes in its place.
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
  const src = assets[id]?.src ?? "";
  switch (assetSourceKind(src)) {
    case "embedded":
      return refuse(
        state,
        "asset",
        "the asset is embedded in the design; only an asset given by path takes a file",
        path,
      );
    case "bound":
      return refuse(
        state,
        "asset",
        "the asset's src is bound to data and fetched by the CLI and the Action; only an asset given by path takes a file",
        path,
      );
    case "path":
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
