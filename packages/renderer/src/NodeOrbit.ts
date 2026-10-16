import type { NodeAnimation } from "./NodeAnimation.js";

/** One transform of the chain an orbit is written as. */
export type OrbitPart =
  | { readonly kind: "move"; readonly x: number; readonly y: number }
  | {
      readonly kind: "turn";
      /** Degrees at the start of the timeline: a whole multiple of the orbit's angle as printed. */
      readonly degrees: number;
      /** The turn the orbit's motion adds over the timeline (0 at its start), when it moves. */
      readonly spin: NodeAnimation | undefined;
    };

/**
 * An orbit with its bindings evaluated. It is written as transforms around the node, never as computed coordinates,
 * so the renderer does no trigonometry and every engine draws the same: an ellipse with semi-axes rx and ry is an
 * epicycle, `translate(c) rotate(t) translate(R1 0) rotate(-2t) translate(R2 0) rotate(t)` with R1 = (rx + ry) / 2
 * and R2 = (rx - ry) / 2, which puts the origin at (rx cos t, ry sin t) from the centre and turns it by 0 in all; a
 * circle is `translate(c) rotate(t) translate(r 0) rotate(-t)`. A layer that is not upright keeps a net turn of t.
 */
export interface NodeOrbit {
  /** The chain, outermost first. */
  readonly parts: readonly OrbitPart[];
  /** The centre in the parent's coordinates and the semi-axes, for the content extent of the parent. */
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * Least output an orbit adds to a node: its static transform group, plus a group per turn its motion animates.
 * Reserved before the node is written, as `minimumNodeBytes` is.
 */
export const minimumOrbitBytes = {
  chain: '<g transform=""></g>'.length,
  spin: "<g></g>".length,
} as const;
