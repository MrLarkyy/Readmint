import type { AnimatedProperty, Layer } from "@readmint/format";

const colour = /^(?:#[0-9a-fA-F]{3,8}|\{\{[\s\S]+\}\})$/u;

/** The value a new track starts and ends on: the layer's own static value when the kind accepts it, else a neutral one. */
function startValue(layer: Layer, { property, value }: AnimatedProperty): unknown {
  const own = (layer as unknown as Record<string, unknown>)[property];
  switch (value) {
    case "colour":
      return typeof own === "string" && colour.test(own) ? own : "#000000";
    case "unit":
      return typeof own === "number" ? own : property === "draw" ? 0 : 1;
    case "scale":
      return 1;
    case "position":
    case "rotation":
      return typeof own === "number" ? own : 0;
  }
}

/** A track that holds the layer's value from the start to the end of the timeline: two keyframes, offsets 0 and 1. */
export function newTrack(layer: Layer, property: AnimatedProperty): unknown {
  const from = startValue(layer, property);
  const to = property.property === "draw" ? 1 : from;
  return {
    keyframes: [
      { offset: 0, value: from },
      { offset: 1, value: to },
    ],
  };
}
