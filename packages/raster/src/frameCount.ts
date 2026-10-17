import { frameTimes } from "@readmint/renderer";
import { type DelayUnit, frameDelays } from "./frameDelays.js";
import type { Timeline } from "./Timeline.js";

/** The frames an export of `animation` at `frameRate` writes before identical ones merge: what `checkPlan` counts. */
export function frameCount(animation: Timeline, frameRate: number, unit: DelayUnit): number {
  return frameDelays(frameTimes(animation, frameRate), animation, frameRate, unit).length;
}
