import { timelineSteps } from "./animationTimeline.js";
import { ease } from "./easing.js";
import type { NodeAnimation, TrackTimeline } from "./NodeAnimation.js";
import { mixValues, settleValue } from "./trackValue.js";

/**
 * Where `time` (ms) falls on the timeline, in thousandths of a percent: a looping timeline starts over at its
 * duration, one that does not loop holds its end.
 */
export function timelinePosition(animation: NodeAnimation, time: number): number {
  const local = animation.loop ? time % animation.duration : Math.min(time, animation.duration);
  return (local / animation.duration) * timelineSteps;
}

/**
 * The value of a track at `position`, as a browser plays the CSS of the same keyframes: the segment's own easing
 * over its share of the timeline, then clamped and rounded like the written keyframes.
 */
export function sampleTrack(track: TrackTimeline, position: number): number[] {
  const keyframes = track.keyframes;
  let index = 0;
  while (index + 1 < keyframes.length && (keyframes[index + 1]?.position ?? 0) <= position) index++;
  const from = keyframes[index];
  const to = keyframes[index + 1];
  if (from === undefined) throw new Error("a track has keyframes");
  if (to === undefined) return [...from.value];
  const progress = (position - from.position) / (to.position - from.position);
  return settleValue(track.property, mixValues(from.value, to.value, ease(from.easing, progress)));
}
