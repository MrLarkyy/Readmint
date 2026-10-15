import type { Bounds } from "./pathBounds.js";
import type { SampledTransforms } from "./sampleAnimation.js";

/**
 * One transform between a node's coordinates and its parent's, as the SVG writes it: a translation, a turn of
 * `degrees` about (`cx`, `cy`), a scale about the origin, or one the renderer cannot know (CSS animation plays it).
 */
export type PlacementStep =
  | { readonly kind: "translate"; readonly x: number; readonly y: number }
  | { readonly kind: "turn"; readonly degrees: number; readonly cx: number; readonly cy: number }
  | { readonly kind: "scale"; readonly factor: number }
  | { readonly kind: "unknown" };

/**
 * A box containing `bounds` after `step`, in the parent's coordinates; undefined for an unknown step. Only + - * min
 * max abs, so every engine computes the same numbers: a turn takes the L1 radius about its centre, which is at least
 * the distance of every corner.
 */
export function placeBounds(bounds: Bounds, step: PlacementStep): Bounds | undefined {
  switch (step.kind) {
    case "translate":
      return {
        minX: bounds.minX + step.x,
        minY: bounds.minY + step.y,
        maxX: bounds.maxX + step.x,
        maxY: bounds.maxY + step.y,
      };
    case "turn": {
      if (step.degrees % 360 === 0) return bounds;
      const radius =
        Math.max(Math.abs(bounds.minX - step.cx), Math.abs(bounds.maxX - step.cx)) +
        Math.max(Math.abs(bounds.minY - step.cy), Math.abs(bounds.maxY - step.cy));
      return {
        minX: step.cx - radius,
        minY: step.cy - radius,
        maxX: step.cx + radius,
        maxY: step.cy + radius,
      };
    }
    case "scale": {
      const f = step.factor;
      return {
        minX: Math.min(bounds.minX * f, bounds.maxX * f),
        minY: Math.min(bounds.minY * f, bounds.maxY * f),
        maxX: Math.max(bounds.minX * f, bounds.maxX * f),
        maxY: Math.max(bounds.minY * f, bounds.maxY * f),
      };
    }
    case "unknown":
      return undefined;
  }
}

/** `bounds` through every step, innermost (last) first; undefined when any step is unknown. */
export function placeThrough(
  bounds: Bounds | undefined,
  steps: readonly PlacementStep[],
): Bounds | undefined {
  let placed = bounds;
  for (let index = steps.length - 1; index >= 0 && placed !== undefined; index--) {
    const step = steps[index];
    if (step !== undefined) placed = placeBounds(placed, step);
  }
  return placed;
}

/** The steps of the groups `renderAnimated` wraps around a node for its sampled transforms, outermost first. */
export function transformSteps({ centre, transforms }: SampledTransforms): PlacementStep[] {
  const steps: PlacementStep[] =
    centre === undefined ? [] : [{ kind: "translate", x: centre.x, y: centre.y }];
  for (const { track, value } of transforms) {
    switch (track.property) {
      case "x":
        steps.push({ kind: "translate", x: value, y: 0 });
        break;
      case "y":
        steps.push({ kind: "translate", x: 0, y: value });
        break;
      case "rotation":
        steps.push({ kind: "turn", degrees: value, cx: 0, cy: 0 });
        break;
      default:
        steps.push({ kind: "scale", factor: value });
    }
  }
  return steps;
}
