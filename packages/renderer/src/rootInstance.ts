import type { ComponentDefinition, ComponentLayer, Design } from "@readmint/format";
import { ownEntry } from "./ownEntry.js";

/** The one component instance a design is: the instance settings files write to and the canvas reads `props` of. */
export interface RootInstance {
  /** Position in the document's `layers`. */
  readonly index: number;
  readonly layer: ComponentLayer;
  readonly definition: ComponentDefinition;
}

/**
 * The document's only top-level `component` layer, when it has no `repeat` and its component exists; none when the
 * design has no such layer or several (other layer kinds beside it do not count).
 */
export function rootInstance(design: Design): RootInstance | undefined {
  let found: { index: number; layer: ComponentLayer } | undefined;
  for (const [index, layer] of design.layers.entries()) {
    if (layer.type !== "component") continue;
    if (found !== undefined) return undefined;
    found = { index, layer };
  }
  if (found === undefined || found.layer.repeat !== undefined) return undefined;
  const definition = ownEntry(design.components, found.layer.ref);
  return definition === undefined ? undefined : { ...found, definition };
}
