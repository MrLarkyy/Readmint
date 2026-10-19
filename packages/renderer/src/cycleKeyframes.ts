import { linearEasing } from "./easing.js";
import type { ResolvedKeyframe } from "./NodeAnimation.js";

/**
 * The keyframes of one cycle (times from the cycle's start) played `cycles` times back to back from `start`, each
 * cycle lasting `duration`. A cycle whose keyframes do not reach its end holds the last value until it ends, one
 * that starts late holds its first value from its start (except the first cycle: the timeline holds that one).
 * Where the keyframe ending a cycle and the one starting the next fall on the same moment with equal values, only the
 * later one stays, so a cycle ending where it starts joins the next without a duplicate. A cycle other than the first
 * that starts at or after `end` (the timeline end) adds nothing, so the last whole cycle ends on its own last value;
 * `onCut` is called when the run would still have passed `end`.
 */
export function cycleKeyframes(
  cycle: readonly ResolvedKeyframe[],
  start: number,
  duration: number,
  cycles: number,
  end: number,
  onCut: () => void,
): ResolvedKeyframe[] {
  const first = cycle[0];
  const last = cycle.at(-1);
  if (first === undefined || last === undefined) throw new Error("a cycle has keyframes");
  const out: ResolvedKeyframe[] = [];
  for (let index = 0; index < cycles; index++) {
    // Integers while delay, stagger and duration are, so every cycle starts exactly where the previous one ends.
    const base = start + index * duration;
    if (index > 0 && base >= end) {
      if (start + (cycles - 1) * duration + last.time > end) onCut();
      break;
    }
    const seam = out.length;
    if (index > 0 && first.time > 0) {
      out.push({ time: base, value: first.value, easing: linearEasing });
    }
    for (const keyframe of cycle) {
      out.push({ time: base + keyframe.time, value: keyframe.value, easing: keyframe.easing });
    }
    if (index < cycles - 1 && last.time < duration) {
      out.push({ time: base + duration, value: last.value, easing: linearEasing });
    }
    const ending = out[seam - 1];
    const starting = out[seam];
    if (ending !== undefined && starting !== undefined && joins(ending, starting)) {
      out.splice(seam - 1, 1);
    }
  }
  return out;
}

function joins(ending: ResolvedKeyframe, starting: ResolvedKeyframe): boolean {
  return (
    ending.time === starting.time &&
    ending.value.length === starting.value.length &&
    ending.value.every((channel, index) => channel === starting.value[index])
  );
}
