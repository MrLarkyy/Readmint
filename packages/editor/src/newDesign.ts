import type { Design } from "@readmint/format";

/** An empty canvas: no layers, no assets, nothing predefined. */
export function newDesign(width = 400, height = 120): Design {
  return { version: 0, canvas: { width, height }, layers: [] };
}
