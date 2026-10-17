import { timelineSteps } from "./animationTimeline.js";
import { ease } from "./easing.js";
import {
  transformProperties,
  type NodeAnimation,
  type TimelineKeyframe,
  type TrackTimeline,
} from "./NodeAnimation.js";
import type { NodeBase } from "./RenderNode.js";
import { mixValues, settleValue } from "./trackValue.js";

/** A transform track and its value at one position of the timeline. */
export interface SampledTransform {
  readonly track: TrackTimeline;
  readonly value: number;
}

/** The transform groups around an animated node at one position, as `renderAnimated` writes them. */
export interface SampledTransforms {
  /**
   * The centre of the node's box the groups sit in when a rotation or scale turns or scales about it, rounded as
   * printed, so the group and the moved element cancel exactly.
   */
  readonly centre: { readonly x: number; readonly y: number } | undefined;
  /** Outermost first. */
  readonly transforms: readonly SampledTransform[];
}

/** The transform groups of `node` at `position`: the drawer and the bounds read the same numbers here. */
export function sampleTransforms(
  node: NodeBase,
  animation: NodeAnimation,
  position: number,
): SampledTransforms {
  const transforms = animation.tracks
    .filter((track) => transformProperties.includes(track.property))
    .map((track) => ({ track, value: sampleTrack(track, position)[0] ?? 0 }));
  const centred = transforms.some(
    ({ track }) => track.property === "rotation" || track.property === "scale",
  );
  const centre = centred
    ? {
        x: Math.round((node.x + node.width / 2) * 1000) / 1000,
        y: Math.round((node.y + node.height / 2) * 1000) / 1000,
      }
    : undefined;
  return { centre, transforms };
}

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
 *
 * A segment one step wide is a jump: keyframes that rounding leaves one step apart (at one moment, or under two steps
 * after the keyframe before them) form one jump, a run; with many keyframes at one offset the run grows by one step
 * each. A position inside the run, or within half a step before it, takes the value of its last keyframe, so a frame
 * at the moment of a jump never draws a value halfway through it. A position below half a step keeps the first
 * keyframe instead: the frame at time 0 is the static state.
 */
export function sampleTrack(track: TrackTimeline, position: number): number[] {
  const keyframes = track.keyframes;
  const jump = jumpValue(keyframes, position);
  if (jump !== undefined) return [...jump];
  let index = 0;
  while (index + 1 < keyframes.length && (keyframes[index + 1]?.position ?? 0) <= position) index++;
  const from = keyframes[index];
  const to = keyframes[index + 1];
  if (from === undefined) throw new Error("a track has keyframes");
  if (to === undefined) return [...from.value];
  const progress = (position - from.position) / (to.position - from.position);
  return settleValue(track.property, mixValues(from.value, to.value, ease(from.easing, progress)));
}

/** The value a position at or inside a jump takes, or undefined when it is not at one. */
function jumpValue(
  keyframes: readonly TimelineKeyframe[],
  position: number,
): readonly number[] | undefined {
  const step = Math.round(position);
  const index = keyframes.findIndex((keyframe) => keyframe.position === step);
  const end = index < 0 ? undefined : jumpEnd(keyframes, index);
  if (end === undefined) return undefined;
  if (step === 0) return keyframes[0]?.value;
  const last = keyframes[end];
  return last !== undefined && position < last.position ? last.value : undefined;
}

/** The index of the last keyframe of the run of one-step segments keyframe `index` lies in, undefined in none. */
function jumpEnd(keyframes: readonly TimelineKeyframe[], index: number): number | undefined {
  const stepAfter = (at: number) => {
    const from = keyframes[at];
    const to = keyframes[at + 1];
    return from !== undefined && to !== undefined && to.position === from.position + 1;
  };
  if (!stepAfter(index) && !stepAfter(index - 1)) return undefined;
  let end = index;
  while (stepAfter(end)) end++;
  return end;
}
