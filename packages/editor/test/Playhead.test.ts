import { describe, expect, test } from "vitest";
import { pause, play, seek, startPlayhead, timeAt } from "../src/Playhead.js";

describe("Playhead", () => {
  test("opens playing from the start", () => {
    expect(startPlayhead).toEqual({ playing: true, time: 0, startedAt: 0 });
  });

  test("a looping clock wraps, a plain one stays at the end", () => {
    const head = play(1000);
    expect(timeAt(head, 1500, 3000, true)).toBe(500);
    expect(timeAt(head, 1000 + 3500, 3000, true)).toBe(500);
    expect(timeAt(head, 1000 + 3500, 3000, false)).toBe(3000);
  });

  test("a clock reading before the start is the start", () => {
    expect(timeAt(play(1000), 900, 3000, true)).toBe(0);
  });

  test("times are whole milliseconds within the timeline", () => {
    expect(timeAt(play(0), 1234.6, 3000, true)).toBe(1235);
    expect(seek(startPlayhead, 12.5, 100).time).toBe(13);
    expect(seek(startPlayhead, -4, 100).time).toBe(0);
    expect(seek(startPlayhead, 101, 100).time).toBe(100);
    expect(seek(startPlayhead, NaN, 100).time).toBe(0);
    expect(seek(startPlayhead, Infinity, 100).time).toBe(0);
  });

  test("seeking pauses", () => {
    expect(seek(play(5), 40, 100).playing).toBe(false);
  });

  test("pausing keeps the time the clock stood at, whatever the clock reads later", () => {
    const paused = pause(play(1000), 1700, 3000, true);
    expect(paused.playing).toBe(false);
    expect(paused.time).toBe(700);
    expect(timeAt(paused, 99_999, 3000, true)).toBe(700);
  });

  test("a shorter duration clamps the paused time", () => {
    const paused = seek(startPlayhead, 2500, 3000);
    expect(seek(paused, paused.time, 1000).time).toBe(1000);
    expect(timeAt(paused, 0, 1000, true)).toBe(1000);
  });
});
