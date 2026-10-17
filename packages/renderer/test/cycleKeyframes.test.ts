import { describe, expect, test } from "vitest";
import { cycleKeyframes } from "../src/cycleKeyframes.js";
import { keywordEasing, linearEasing, type EasingCurve } from "../src/easing.js";
import type { ResolvedKeyframe } from "../src/NodeAnimation.js";

const easeIn = keywordEasing("ease-in");
const easeOut = keywordEasing("ease-out");

/** One cycle of `[offset, value]` keyframes over `duration`, times relative as resolveTrack hands them over. */
function cycle(
  duration: number,
  keyframes: readonly (readonly [number, readonly number[], EasingCurve?])[],
): ResolvedKeyframe[] {
  return keyframes.map(([offset, value, easing]) => ({
    time: offset * duration,
    value,
    easing: easing ?? linearEasing,
  }));
}

const times = (keyframes: readonly ResolvedKeyframe[]) => keyframes.map(({ time }) => time);
const values = (keyframes: readonly ResolvedKeyframe[]) => keyframes.map(({ value }) => value);

describe("cycleKeyframes", () => {
  test("one cycle keeps the times a track has without cycles: start + offset x duration", () => {
    const offsets = [0, 0.1, 0.3, 0.7, 1];
    const once = cycleKeyframes(
      cycle(
        700,
        offsets.map((offset) => [offset, [offset]] as const),
      ),
      85,
      700,
      1,
    );
    expect(times(once)).toEqual(offsets.map((offset) => 85 + offset * 700));
    expect(values(once)).toEqual(offsets.map((offset) => [offset]));
  });

  test("a cycle ending where it starts joins the next once, the later easing leading on", () => {
    const bounce = cycle(400, [
      [0, [0], easeOut],
      [0.5, [1], easeIn],
      [1, [0]],
    ]);
    const out = cycleKeyframes(bounce, 0, 400, 3);
    expect(times(out)).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
    expect(values(out)).toEqual([[0], [1], [0], [1], [0], [1], [0]]);
    expect(out.map(({ easing }) => easing.css)).toEqual([
      "ease-out",
      "ease-in",
      "ease-out",
      "ease-in",
      "ease-out",
      "ease-in",
      "linear",
    ]);
  });

  test("equal values of different arrays join too, colour channels compared one by one", () => {
    const tint = (alpha: number) => [9, 105, 218, alpha];
    const out = cycleKeyframes(
      [
        { time: 0, value: tint(1), easing: linearEasing },
        { time: 100, value: tint(0.5), easing: linearEasing },
        { time: 200, value: tint(1), easing: linearEasing },
      ],
      0,
      200,
      2,
    );
    expect(times(out)).toEqual([0, 100, 200, 300, 400]);
  });

  test("a seam between different values keeps both keyframes: the value jumps", () => {
    const pulse = cycle(300, [
      [0, [1]],
      [1, [0.2]],
    ]);
    const out = cycleKeyframes(pulse, 0, 300, 3);
    expect(times(out)).toEqual([0, 300, 300, 600, 600, 900]);
    expect(values(out)).toEqual([[1], [0.2], [1], [0.2], [1], [0.2]]);
  });

  test("a cycle not reaching its end holds its last value, one starting late holds its first", () => {
    const inner = cycle(400, [
      [0.25, [1], easeIn],
      [0.75, [1.5]],
    ]);
    const out = cycleKeyframes(inner, 0, 400, 3);
    // the first cycle's lead and the last cycle's tail are the timeline's holds, not this one's
    expect(times(out)).toEqual([100, 300, 400, 400, 500, 700, 800, 800, 900, 1100]);
    expect(values(out)).toEqual([[1], [1.5], [1.5], [1], [1], [1.5], [1.5], [1], [1], [1.5]]);
    expect(out.map(({ easing }) => easing.css)).toEqual([
      "ease-in",
      "linear",
      "linear",
      "linear",
      "ease-in",
      "linear",
      "linear",
      "linear",
      "ease-in",
      "linear",
    ]);
  });

  test("holds of equal values join like keyframes do", () => {
    const flat = cycle(400, [
      [0.25, [1]],
      [0.75, [1]],
    ]);
    expect(times(cycleKeyframes(flat, 0, 400, 2))).toEqual([100, 300, 400, 500, 700]);
  });

  test("times are exact per cycle: base start + index x duration, then the cycle's own time", () => {
    const offsets = [0, 0.033333, 0.083333, 1];
    const bounce = cycle(
      9000,
      offsets.map((offset, index) => [offset, [index === 1 ? -7 : 0]] as const),
    );
    const out = cycleKeyframes(bounce, 85, 9000, 5);
    const expected = [0, 1, 2, 3, 4].flatMap((index) =>
      offsets
        .filter((_, at) => index === 0 || at > 0)
        .map((offset) => 85 + index * 9000 + offset * 9000),
    );
    expect(times(out)).toEqual(expected);
    expect(out).toHaveLength(16);
    expect(out.at(-1)?.time).toBe(85 + 45_000);
  });
});
