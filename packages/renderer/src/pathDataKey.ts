import { isPathTemplate, type PathLayer } from "@readmint/format";

/**
 * The key a path's bounds and drawn length are cached under: the layer pointer for a literal `d`, which every repeat
 * copy shares, and the resolved data for a template, which each copy may change. Path data never holds a `/` and a
 * pointer always starts with one, so the two kinds of key cannot meet.
 */
export function pathDataKey(layer: PathLayer, path: string, d: string): string {
  return isPathTemplate(layer.d) ? d : path;
}
