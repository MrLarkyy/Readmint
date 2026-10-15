import type { Bounds } from "./pathBounds.js";
import type { SampledTransforms } from "./sampleAnimation.js";
import { turnInterval, type Interval } from "./turnInterval.js";

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
 * A box containing `bounds` after `step`, in the parent's coordinates; undefined for an unknown step. Only + - * / %
 * round min max abs, so every engine computes the same numbers: a turn rotates the box with cosine and sine intervals
 * (`turnInterval`), each axis by interval products, then grows it by 1 plus a millionth of its reach for single
 * precision coordinates in rasterizers; a non-finite angle takes the L1 radius about the centre, which is at least
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
      const turn = turnInterval(step.degrees);
      if (turn !== undefined) return turned(bounds, step.cx, step.cy, turn.cos, turn.sin);
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

function turned(bounds: Bounds, cx: number, cy: number, cos: Interval, sin: Interval): Bounds {
  const dx = { lo: bounds.minX - cx, hi: bounds.maxX - cx };
  const dy = { lo: bounds.minY - cy, hi: bounds.maxY - cy };
  const along = times(cos, dx);
  const across = times(sin, dy);
  const x = { lo: cx + along.lo - across.hi, hi: cx + along.hi - across.lo };
  const down = times(sin, dx);
  const up = times(cos, dy);
  const y = { lo: cy + down.lo + up.lo, hi: cy + down.hi + up.hi };
  const reach = Math.max(Math.abs(x.lo), Math.abs(x.hi), Math.abs(y.lo), Math.abs(y.hi));
  const growth = 1 + reach * 1e-6;
  return { minX: x.lo - growth, minY: y.lo - growth, maxX: x.hi + growth, maxY: y.hi + growth };
}

function times(a: Interval, b: Interval): Interval {
  const products = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi];
  return { lo: Math.min(...products), hi: Math.max(...products) };
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
