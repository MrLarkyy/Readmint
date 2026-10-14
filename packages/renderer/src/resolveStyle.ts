import type { Layer, Style } from "@readmint/format";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";

/** A property value and the pointer it came from, so an issue names the place to fix. */
export interface StyledValue {
  readonly value: unknown;
  readonly path: string;
}

/** The layer's own property, else the one of its style (own property wins); `value` undefined when neither has it. */
export function resolveStyle(
  context: RenderContext,
  layer: Layer,
  layerPath: string,
  key: keyof Style,
): StyledValue {
  const own: unknown = (layer as unknown as Readonly<Record<string, unknown>>)[key];
  if (own !== undefined && Object.hasOwn(layer, key))
    return { value: own, path: pointer(layerPath, key) };
  if (layer.style === undefined) return { value: undefined, path: pointer(layerPath, key) };
  const style = ownEntry(context.design.styles, layer.style);
  const inherited = style === undefined || !Object.hasOwn(style, key) ? undefined : style[key];
  if (inherited === undefined) return { value: undefined, path: pointer(layerPath, key) };
  return { value: inherited, path: pointer(pointer("/styles", layer.style), key) };
}
