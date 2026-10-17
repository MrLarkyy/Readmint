import { describe, expect, test } from "vitest";
import { buildTimeline, timelineSteps } from "../src/animationTimeline.js";
import { ease, keywordEasing, linearEasing, type EasingCurve } from "../src/easing.js";
import type { AnimatedProperty, TrackTimeline } from "../src/NodeAnimation.js";
import { sampleTrack } from "../src/sampleAnimation.js";
import { mixValues, settleValue } from "../src/trackValue.js";

/** The timeline of `[time, value, easing?]` keyframes over `duration` ms. */
function timeline(
  duration: number,
  keyframes: readonly (readonly [number, readonly number[], EasingCurve?])[],
  property: AnimatedProperty = "opacity",
): TrackTimeline {
  const resolved = keyframes.map(([time, value, easing]) => ({
    time,
    value,
    easing: easing ?? linearEasing,
  }));
  return buildTimeline(property, resolved, duration, () => undefined);
}

/** The position of `time` on a timeline of `duration` ms, as `timelinePosition` computes it. */
const positionOf = (time: number, duration: number) => (time / duration) * timelineSteps;

const positions = (track: TrackTimeline) => track.keyframes.map(({ position }) => position);

/** The sampler before jumps were settled (RM-147): the float position inside the one-step ramp. */
function rampSample(track: TrackTimeline, position: number): number[] {
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

/** A ramp from 0.2 to 0.8 until `at`, a jump to 0.1 there, then a ramp to 0.5 at the end. */
const jumpAt = (duration: number, at: number) =>
  timeline(duration, [
    [0, [0.2]],
    [at, [0.8]],
    [at, [0.1]],
    [duration, [0.5]],
  ]);

describe("sampleTrack at a jump (RM-147)", () => {
  test("a jump whose position rounds down draws the later value", () => {
    const track = jumpAt(60000, 2000);
    expect(positions(track)).toEqual([0, 3333, 3334, 100000]);
    expect(positionOf(2000, 60000)).toBeCloseTo(3333.333, 3);
    expect(sampleTrack(track, positionOf(2000, 60000))).toEqual([0.1]);
  });

  test("a jump whose position rounds up draws the later value", () => {
    const track = jumpAt(60000, 4000);
    expect(positions(track)).toEqual([0, 6667, 6668, 100000]);
    expect(positionOf(4000, 60000)).toBeLessThan(6667);
    expect(sampleTrack(track, positionOf(4000, 60000))).toEqual([0.1]);
  });

  test("a jump at an integral position draws the later value", () => {
    const track = jumpAt(1200, 300);
    expect(positions(track)).toEqual([0, 25000, 25001, 100000]);
    expect(positionOf(300, 1200)).toBe(25000);
    expect(sampleTrack(track, 25000)).toEqual([0.1]);
  });

  test("the window runs from half a step before the jump to the end of its ramp", () => {
    const track = jumpAt(1200, 300);
    for (const position of [24999.5, 24999.9, 25000.3, 25000.5, 25000.7, 25000.999, 25001])
      expect(sampleTrack(track, position)).toEqual([0.1]);
    expect(sampleTrack(track, 24999.4)).toEqual(rampSample(track, 24999.4));
    expect(sampleTrack(track, 24999.4)[0]).toBeGreaterThan(0.79);
    expect(sampleTrack(track, 25001.2)).toEqual(rampSample(track, 25001.2));
  });

  test("three keyframes at one moment draw the last one", () => {
    const track = timeline(1200, [
      [0, [0]],
      [300, [1]],
      [300, [0.6]],
      [300, [0.3]],
      [1200, [0]],
    ]);
    expect(positions(track)).toEqual([0, 25000, 25001, 25002, 100000]);
    for (const position of [24999.5, 25000, 25001, 25001.6, 25002])
      expect(sampleTrack(track, position)).toEqual([0.3]);
  });

  test("a jump at time 0 keeps the first value at 0, the static state, and the later one after", () => {
    const track = timeline(60000, [
      [0, [0.4]],
      [0, [0.9]],
      [1000, [0]],
    ]);
    expect(positions(track).slice(0, 2)).toEqual([0, 1]);
    expect(sampleTrack(track, 0)).toEqual([0.4]);
    expect(sampleTrack(track, 0.3)).toEqual([0.4]);
    expect(sampleTrack(track, 0.7)).toEqual([0.9]);
    expect(sampleTrack(track, 1)).toEqual([0.9]);
  });

  test("a jump at the timeline end draws the later value", () => {
    const atEnd = timeline(60000, [
      [0, [0]],
      [60000, [1]],
      [60000, [0.5]],
    ]);
    expect(positions(atEnd)).toEqual([0, 100000]);
    expect(sampleTrack(atEnd, 100000)).toEqual([0.5]);
    const stepBefore = timeline(60000, [
      [0, [0]],
      [59999.4, [1]],
      [59999.4, [0.5]],
    ]);
    expect(positions(stepBefore)).toEqual([0, 99999, 100000]);
    expect(sampleTrack(stepBefore, 99999.3)).toEqual([0.5]);
    expect(sampleTrack(stepBefore, 100000)).toEqual([0.5]);
  });

  test("a hold at 0 before a first keyframe less than a step later keeps the hold at 0", () => {
    const track = timeline(60000, [
      [0.2, [0.4]],
      [30000, [1]],
    ]);
    expect(positions(track)).toEqual([0, 1, 50000, 100000]);
    expect(sampleTrack(track, 0)).toEqual([0.4]);
    expect(sampleTrack(track, 0.7)).toEqual([0.4]);
  });

  test("positions away from a jump sample what they did before", () => {
    const easeInOut = keywordEasing("ease-in-out");
    const tracks = [
      timeline(1000, [
        [0, [0]],
        [1000, [1]],
      ]),
      timeline(1000, [
        [0, [0], keywordEasing("ease-out")],
        [400, [-24], keywordEasing("ease-in")],
        [1000, [0]],
      ]),
      timeline(
        60000,
        [
          [100, [9, 105, 218, 1], easeInOut],
          [30000, [130, 80, 223, 0.4]],
          [60000, [207, 34, 46, 1]],
        ],
        "fill",
      ),
      jumpAt(1200, 300),
    ];
    for (const track of tracks) {
      for (let step = 0; step <= timelineSteps; step += 997) {
        for (const position of [step, step + 0.4]) {
          const jump = track.keyframes.some(
            ({ position: at }, index) =>
              track.keyframes[index + 1]?.position === at + 1 &&
              position >= at - 0.5 &&
              position < at + 1,
          );
          if (jump || position > timelineSteps) continue;
          expect(sampleTrack(track, position)).toEqual(rampSample(track, position));
        }
      }
    }
  });
});
