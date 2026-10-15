/** Where an asset's bytes come from. */
export type AssetSourceKind = "embedded" | "bound" | "path";

/**
 * The CLI's rule (`loadDesignAssets`) for an asset `src`: a `data:` URI is embedded and left to the renderer, which
 * decodes and checks it (a malformed one is its issue, never a file to attach); a `{{binding}}` is fetched by the CLI
 * and the Action; anything else is a path read next to the design.
 */
export function assetSourceKind(src: string): AssetSourceKind {
  if (src.startsWith("data:")) return "embedded";
  if (src.length >= 4 && src.startsWith("{{") && src.endsWith("}}")) return "bound";
  return "path";
}
