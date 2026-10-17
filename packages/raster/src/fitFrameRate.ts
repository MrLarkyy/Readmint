import { frameCount } from "./frameCount.js";
import type { DelayUnit } from "./frameDelays.js";
import type { Timeline } from "./Timeline.js";

/**
 * The highest whole frame rate from `start` down to 1 whose frame count `fits`, or `undefined` when even 1 fps does
 * not. The count is the one the export checks (GIF delay merges and the held end frame of a timeline that does not
 * loop included), so a rate named here passes those checks.
 */
export function fitFrameRate(
  animation: Timeline,
  start: number,
  unit: DelayUnit,
  fits: (frames: number) => boolean,
): number | undefined {
  for (let rate = start; rate >= 1; rate--) {
    if (fits(frameCount(animation, rate, unit))) return rate;
  }
  return undefined;
}
