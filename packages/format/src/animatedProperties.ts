import type { AnimatedProperty } from "./AnimatedProperty.js";
import type { Layer } from "./Design.js";

const track = (property: string, value: AnimatedProperty["value"]): AnimatedProperty =>
  Object.freeze({ property, value });

const common = [
  track("opacity", "unit"),
  track("x", "position"),
  track("y", "position"),
  track("scale", "scale"),
  track("rotation", "rotation"),
];
const colours = [track("fill", "colour"), track("stroke", "colour")];

const table: Readonly<Record<Layer["type"], readonly AnimatedProperty[]>> = Object.freeze({
  group: Object.freeze(common),
  image: Object.freeze(common),
  component: Object.freeze(common),
  rect: Object.freeze([...common, ...colours]),
  ellipse: Object.freeze([...common, ...colours]),
  path: Object.freeze([...common, ...colours, track("draw", "unit")]),
  text: Object.freeze([...common, track("fill", "colour")]),
});

/** The tracks a layer of this type can animate, in a fixed order; each property at most once per layer. */
export function animatedProperties(type: Layer["type"]): readonly AnimatedProperty[] {
  return table[type];
}
