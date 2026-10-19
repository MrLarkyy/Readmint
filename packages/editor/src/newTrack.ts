import type { AnimatedProperty, Layer } from "@readmint/format";

const colour = /^(?:#[0-9a-fA-F]{3,8}|\{\{[\s\S]+\}\})$/u;
const binding = /^\{\{[\s\S]+\}\}$/u;

/**
 * A track that holds the frame the layer already shows, so adding it changes nothing until a keyframe is edited: two
 * keyframes, offsets 0 and 1. `x`, `y` and `rotation` are offsets on top of the layer, so they start at 0 and `scale` at
 * 1; `opacity`, `fill` and `stroke` replace the layer's value, so they start from its literal or binding; `draw` holds
 * the full stroke. Undefined when the layer has no colour (or a gradient, or `none`) to start a `fill` or `stroke` from.
 */
export function newTrack(layer: Layer, { property, value }: AnimatedProperty): unknown {
  const own = (layer as unknown as Record<string, unknown>)[property];
  let start: unknown;
  switch (value) {
    case "position":
    case "rotation":
      start = 0;
      break;
    case "scale":
      start = 1;
      break;
    case "colour":
      if (typeof own !== "string" || !colour.test(own)) return undefined;
      start = own;
      break;
    case "unit":
      if (property === "draw") start = 1;
      else
        start = typeof own === "number" || (typeof own === "string" && binding.test(own)) ? own : 1;
      break;
  }
  return {
    keyframes: [
      { offset: 0, value: start },
      { offset: 1, value: start },
    ],
  };
}
