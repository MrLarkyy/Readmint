import { frameCount } from "./frameCount.js";
import type { DelayUnit } from "./frameDelays.js";
import type { Timeline } from "./Timeline.js";

/**
 * The lowest whole frame rate up to `highest` that samples at least two frames of `animation`, the floor below which
 * an export would be a still image; `highest` when not even that rate does.
 */
export function lowestFrameRate(animation: Timeline, highest: number, unit: DelayUnit): number {
  for (let rate = 1; rate < highest; rate++) {
    if (frameCount(animation, rate, unit) >= 2) return rate;
  }
  return highest;
}
