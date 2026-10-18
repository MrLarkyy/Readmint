import type { RenderManifestEntry } from "@readmint/format";
import type { EditorManifest } from "./EditorManifest.js";

/** The last `/`-separated segment of a manifest design path. */
export function designFileOf(design: string): string {
  return design.slice(design.lastIndexOf("/") + 1);
}

/** The renders whose design file is `fileName` (the last segment of their `design` path); the browser has no folder to tell two files of one name apart. */
export function rendersOfFile(
  manifest: EditorManifest,
  fileName: string | undefined,
): RenderManifestEntry[] {
  if (fileName === undefined) return [];
  return manifest.renders.filter((entry) => designFileOf(entry.design) === fileName);
}

/** The chosen render and its position in the manifest (its pointer is `/renders/<index>`). */
export function chosenRender(
  manifest: EditorManifest | undefined,
): { entry: RenderManifestEntry; index: number } | undefined {
  if (manifest?.render === undefined) return undefined;
  const index = manifest.renders.findIndex((entry) => entry.name === manifest.render);
  const entry = manifest.renders[index];
  return entry === undefined ? undefined : { entry, index };
}
