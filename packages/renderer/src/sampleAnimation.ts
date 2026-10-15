import { timelineSteps } from "./animationTimeline.js";
import { ease } from "./easing.js";
import { transformProperties, type NodeAnimation, type TrackTimeline } from "./NodeAnimation.js";
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
