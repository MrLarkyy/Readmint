import { ValueRanges, type Animation } from "@readmint/format";

/**
 * The frame times (ms) of a timeline at `frameRate` frames per second, for raster export: `i * 1000 / frameRate`
 * below the duration, then the duration itself when the timeline does not loop (its held last frame). A looping
 * timeline leaves the duration out, as it equals time 0. Throws a RangeError for a duration outside 1..60000 ms or a
 * frame rate outside 1..60.
 */
export function frameTimes(animation: Animation, frameRate: number): number[] {
  const { duration } = animation;
  const range = ValueRanges.animationDuration;
  if (!Number.isInteger(duration) || duration < (range.minimum ?? 1) || duration > range.maximum) {
    throw new RangeError(`duration must be an integer in [1, 60000], got ${String(duration)}`);
  }
  if (!(frameRate >= 1 && frameRate <= 60)) {
    throw new RangeError(`frameRate must be in [1, 60], got ${String(frameRate)}`);
  }
  const times: number[] = [];
  for (let frame = 0; (frame * 1000) / frameRate < duration; frame++) {
    times.push((frame * 1000) / frameRate);
  }
  if (animation.loop === false) times.push(duration);
  return times;
}
