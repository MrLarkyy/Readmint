import type { Design, GroupLayer, Layer } from "@readmint/format";
import { getAt, splitPointer } from "./designPointer.js";

const layerTypes = new Set(["group", "rect", "ellipse", "path", "text", "image", "component"]);

/** The layer at a pointer under `/layers`, or undefined when the pointer names none. */
export function findLayer(design: Design, pointer: string): Layer | undefined {
  if (!pointer.startsWith("/layers/")) return undefined;
  const value = getAt(design, pointer);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && layerTypes.has(type) ? (value as Layer) : undefined;
}

/** The group holding the layer at `pointer`, undefined for a top-level layer. */
export function parentGroup(design: Design, pointer: string): GroupLayer | undefined {
  const split = splitPointer(pointer);
  if (split === undefined) return undefined;
  const holder = splitPointer(split.parent);
  if (holder?.key !== "children") return undefined;
  const parent = findLayer(design, holder.parent);
  return parent?.type === "group" ? parent : undefined;
}

/** Whether a stack or grid layout of the parent group places the layer: its own x/y are then slot offsets. */
export function placedByLayout(design: Design, pointer: string): boolean {
  const type = parentGroup(design, pointer)?.layout?.type;
  return type === "stack" || type === "grid";
}

/** Every layer `id` of the design, in its layers and its component definitions. */
export function layerIds(design: Design): Set<string> {
  const ids = new Set<string>();
  const visit = (layers: readonly Layer[]) => {
    for (const layer of layers) {
      if (layer.id !== undefined) ids.add(layer.id);
      if (layer.type === "group") visit(layer.children);
    }
  };
  visit(design.layers);
  for (const definition of Object.values(design.components ?? {})) visit(definition.layers);
  return ids;
}

/** `base` itself, or `base` with the smallest number suffix not in `taken`. */
export function uniqueId(base: string, taken: ReadonlySet<string>, separator = ""): string {
  if (!taken.has(base) && separator !== "") return base;
  for (let index = separator === "" ? 1 : 2; ; index++) {
    const candidate = `${base}${separator}${String(index)}`;
    if (!taken.has(candidate)) return candidate;
  }
}
