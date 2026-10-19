import { describe, expect, test } from "vitest";
import { setLayerTrack, setTimeline } from "../src/index.js";
import { editState, rectPointer } from "./formatEdits.js";

const state = editState();
const bare = setLayerTrack(state, rectPointer, "x", undefined);

describe("setTimeline", () => {
  test("adds, changes and removes the timeline when no layer animates", () => {
    const without = setTimeline(bare, undefined);
    expect(without.issues).toEqual([]);
    expect(without.design.animation).toBeUndefined();
    const added = setTimeline(without, { duration: 3000, loop: true });
    expect(added.issues).toEqual([]);
    expect(added.design.animation).toEqual({ duration: 3000, loop: true });
    const changed = setTimeline(added, { duration: 60_000, loop: false });
    expect(changed.design.animation).toEqual({ duration: 60_000, loop: false });
  });

  test("an equal timeline is no change", () => {
    expect(setTimeline(state, { duration: 1000 }).design).toBe(state.design);
    const without = setTimeline(bare, undefined);
    expect(setTimeline(without, undefined).design).toBe(without.design);
  });

  test.each([0, 60_001, NaN, Infinity, -5, 1.5, "3000", null, {}])(
    "refuses the duration %j with the range issue",
    (duration) => {
      const next = setTimeline(state, { duration });
      expect(next.design).toBe(state.design);
      expect(next.issues).toHaveLength(1);
    },
  );

  test.each(["yes", 1, null])("refuses loop %j", (loop) => {
    const next = setTimeline(state, { duration: 1000, loop });
    expect(next.design).toBe(state.design);
    expect(next.issues).toHaveLength(1);
  });

  test.each([3, "x", [], { duration: 1000, extra: 1 }])("refuses the timeline %j", (value) => {
    const next = setTimeline(state, value);
    expect(next.design).toBe(state.design);
    expect(next.issues).toHaveLength(1);
  });

  test("removal is refused while a layer animates and says why", () => {
    const next = setTimeline(state, undefined);
    expect(next.design).toBe(state.design);
    expect(next.issues).toHaveLength(1);
    expect(next.issues[0]?.message).toMatch(/animation|timeline/u);
  });
});
