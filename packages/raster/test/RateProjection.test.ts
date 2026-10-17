import { describe, expect, test } from "vitest";
import { lowestFrameRate } from "../src/lowestFrameRate.js";
import { RateProjection } from "../src/RateProjection.js";

const animation = { duration: 1000, loop: true };
const unit = { ms: 1, min: 1 };
/** 1 fps samples one frame of a 1000 ms loop, 2 fps two. */
const lowest = lowestFrameRate(animation, 20, unit);

/** A 20 fps projection whose first frame took `head` bytes, then frames that took the following sizes. */
function projection(head: number, ...sizes: number[]): RateProjection {
  const result = new RateProjection(animation, unit, 20, lowest, 1000);
  result.written(head);
  for (const size of sizes) result.written(size);
  return result;
}

describe("RateProjection", () => {
  test("the lowest rate that animates a 1000 ms loop is 2 fps", () => {
    expect(lowest).toBe(2);
  });

  test("costs each later frame as the average so far and counts every frame of the lower rate", () => {
    // 100 B first frame, 317 B for each of the 3 after it; r fps writes r frames: 100 + 317 * (r - 1) <= 700 B.
    expect(projection(100, 200, 300).rate(1050, true)).toBe(2);
  });

  test("a failure while finishing counts only the frames written", () => {
    // 297 B a frame over 3 later frames: 3 fps is 693 B; 445 B a frame over 2: only 2 fps (545 B).
    expect(projection(100, 200, 300).rate(990, true)).toBe(3);
    expect(projection(100, 200, 300).rate(990, false)).toBe(2);
  });

  test("names the lowest rate that animates when only that fits, within the limit itself", () => {
    expect(projection(100, 200, 300).rate(2100, true)).toBe(2);
  });

  test("never names a rate that samples one frame, though that one would fit", () => {
    // 2 fps is 1067 B, over the limit; 1 fps would be the first frame alone, a still image.
    expect(projection(100, 200, 300).rate(3000, true)).toBeUndefined();
  });

  test("names nothing when no rate fits, before a second frame, or without a first frame", () => {
    expect(projection(1500).rate(1600, true)).toBeUndefined();
    expect(projection(100).rate(1050, false)).toBeUndefined();
    expect(new RateProjection(animation, unit, 20, lowest, 1000).rate(1050, true)).toBeUndefined();
  });

  test("names nothing at the lowest rate", () => {
    const result = new RateProjection(animation, unit, lowest, lowest, 1000);
    result.written(100);
    expect(result.rate(1500, true)).toBeUndefined();
  });
});
