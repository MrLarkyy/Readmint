import { describe, expect, test } from "vitest";
import { RateProjection } from "../src/RateProjection.js";

const animation = { duration: 1000, loop: true };
const unit = { ms: 1, min: 1 };

/** A 20 fps projection whose first frame took `head` bytes, then frames that took the following sizes. */
function projection(head: number, ...sizes: number[]): RateProjection {
  const result = new RateProjection(animation, unit, 20, 1000);
  result.written(head);
  for (const size of sizes) result.written(size);
  return result;
}

describe("RateProjection", () => {
  test("costs each later frame as the average so far and counts every frame of the lower rate", () => {
    // 100 B first frame, 317 B for each of the 3 after it; r fps writes r frames: 100 + 317 * (r - 1) <= 700 B.
    expect(projection(100, 200, 300).rate(1050, true)).toBe(2);
  });

  test("a failure while finishing counts only the frames written", () => {
    expect(projection(100, 200, 300).rate(1500, true)).toBe(2);
    expect(projection(100, 200, 300).rate(1500, false)).toBe(1);
  });

  test("names 1 fps when only that fits, within the limit itself", () => {
    expect(projection(100, 200, 300).rate(2100, true)).toBe(1);
  });

  test("names nothing when not even 1 fps fits, before a second frame, or without a first frame", () => {
    expect(projection(1500).rate(1600, true)).toBeUndefined();
    expect(projection(100).rate(1050, false)).toBeUndefined();
    expect(new RateProjection(animation, unit, 20, 1000).rate(1050, true)).toBeUndefined();
  });

  test("names nothing at 1 fps", () => {
    const result = new RateProjection(animation, unit, 1, 1000);
    result.written(100);
    expect(result.rate(1500, true)).toBeUndefined();
  });
});
