import path from "node:path";
import { checkAssetPath } from "./checkAssetPath.js";
import { isBoundSource } from "./isBoundSource.js";
import type { DesignFile } from "./loadDesignFile.js";

/**
 * Lexical paths of the design's file assets, the ones the preview watches: watched even while missing, so creating
 * one reloads. Data URIs and sources bound to data are no files.
 */
export function watchedAssetPaths(file: DesignFile): string[] {
  const paths: string[] = [];
  for (const kind of ["fonts", "images"] as const) {
    const declared: Readonly<Record<string, { readonly src: string }>> =
      file.design.assets?.[kind] ?? {};
    for (const asset of Object.values(declared)) {
      const notAFile = asset.src.startsWith("data:") || isBoundSource(asset.src);
      if (notAFile || checkAssetPath(asset.src) !== undefined) continue;
      paths.push(path.join(file.designDir, ...asset.src.split("/")));
    }
  }
  return paths;
}
