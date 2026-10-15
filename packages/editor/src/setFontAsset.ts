import { commitDesign, refuse } from "./commitDesign.js";
import { childPointer, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";

/** What the asset panel edits of a font; `undefined` removes an optional field. */
export interface FontAssetChange {
  readonly family?: string;
  readonly weight?: number | undefined;
  readonly style?: "normal" | "italic" | undefined;
  readonly embedding?: "allowed" | "restricted";
  /** SPDX identifier of the licence. */
  readonly licenceName?: string | undefined;
  readonly drawAs?: "font" | "paths" | undefined;
}

/**
 * Changes a font asset; every field and licence field the change does not name (`reservedFontName`, `fallback`, ...)
 * stays as it is. Its embedding can always be restricted, but never set to `allowed` when the font's own OS/2 fsType
 * forbids embedding (the stricter reading wins, as in the renderer): that change is refused.
 */
export function setFontAsset(state: EditorState, id: string, change: FontAssetChange): EditorState {
  const fonts = state.design.assets?.fonts;
  const path = childPointer("/assets/fonts", id);
  const asset = fonts !== undefined && Object.hasOwn(fonts, id) ? fonts[id] : undefined;
  if (asset === undefined) return refuse(state, "font", "no such font", path);
  const check = Object.hasOwn(state.fontChecks, id) ? state.fontChecks[id] : undefined;
  if (change.embedding === "allowed" && check?.embeddable === false) {
    return refuse(
      state,
      "font",
      `this font forbids embedding in its OS/2 fsType (0x${check.fsType.toString(16).padStart(4, "0")}): it stays restricted and is drawn as paths`,
      childPointer(childPointer(path, "licence"), "embedding"),
    );
  }
  // Every licence field the change does not name is kept as it is (reservedFontName and any later one).
  const name = "licenceName" in change ? change.licenceName : asset.licence.name;
  const licence = Object.fromEntries(
    Object.entries({
      ...asset.licence,
      embedding: change.embedding ?? asset.licence.embedding,
      name: name === "" ? undefined : name,
    }).filter(([, value]) => value !== undefined),
  );
  const changed = new Map<string, unknown>(
    (["family", "weight", "style", "drawAs"] as const)
      .filter((key) => key in change)
      .map((key) => [key, change[key]]),
  );
  const entries = Object.entries({ ...asset, licence })
    .map(([key, value]) => [key, changed.has(key) ? changed.get(key) : value] as const)
    .concat([...changed].filter(([key]) => !Object.hasOwn(asset, key)))
    .filter(([, value]) => value !== undefined);
  return commitDesign(state, setAt(state.design, path, Object.fromEntries(entries)));
}
