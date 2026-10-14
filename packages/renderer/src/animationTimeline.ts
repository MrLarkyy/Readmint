import { ease, linearEasing } from "./easing.js";
import type {
  AnimatedProperty,
  ResolvedKeyframe,
  TimelineKeyframe,
  TrackTimeline,
} from "./NodeAnimation.js";
import { mixValues, settleValue } from "./trackValue.js";

/** Positions per timeline: thousandths of a percent, the precision of the printed CSS percentages. */
export const timelineSteps = 100_000;

/**
 * The keyframes of one track mapped onto a timeline of `duration` ms: the first value holds from 0 until the track
 * starts, the last one from its end to 100%. A track running past the timeline end is cut there, its last keyframe
 * being the value at the end (`onCut` is called). Positions are rounded and strictly increase: a keyframe landing
 * on the position before it moves one step later, at the very end the later one wins.
 */
export function buildTimeline(
  property: AnimatedProperty,
  keyframes: readonly ResolvedKeyframe[],
  duration: number,
  onCut: () => void,
): TrackTimeline {
  const out: TimelineKeyframe[] = [];
  const push = (time: number, value: readonly number[], easing: ResolvedKeyframe["easing"]) => {
    let position = Math.round((time / duration) * timelineSteps);
    const last = out.at(-1);
    if (last !== undefined && position <= last.position) position = last.position + 1;
    const keyframe = { position, value: settleValue(property, value), easing };
    if (last !== undefined && position > timelineSteps) {
      out[out.length - 1] = { ...keyframe, position: last.position };
    } else out.push(keyframe);
  };
  const [first] = keyframes;
  if (first === undefined) throw new Error("a track has keyframes");
  if (first.time > 0) push(0, first.value, linearEasing);
  let previous: ResolvedKeyframe | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time <= duration) {
      push(keyframe.time, keyframe.value, keyframe.easing);
      previous = keyframe;
      continue;
    }
    onCut();
    const from = previous ?? first;
    const span = keyframe.time - from.time;
    const amount = previous === undefined || span <= 0 ? 0 : (duration - from.time) / span;
    push(duration, mixValues(from.value, keyframe.value, ease(from.easing, amount)), linearEasing);
    break;
  }
  const last = out.at(-1);
  if (last !== undefined && last.position < timelineSteps) {
    // What follows is a hold, so its easing changes nothing; linear lets equal tracks share their CSS.
    out[out.length - 1] = { ...last, easing: linearEasing };
    push(duration, last.value, linearEasing);
  }
  const alpha = out.some((keyframe) => keyframe.value.length === 4 && keyframe.value[3] !== 1);
  return { property, keyframes: out, alpha };
}
