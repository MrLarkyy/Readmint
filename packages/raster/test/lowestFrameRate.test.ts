import { describe, expect, test } from "vitest";
import { lowestFrameRate } from "../src/lowestFrameRate.js";

const ms = { ms: 1, min: 1 };
const cs = { ms: 10, min: 2 };

describe("lowestFrameRate", () => {
  test("a long loop animates at 1 fps", () => {
    expect(lowestFrameRate({ duration: 60_000, loop: true }, 30, ms)).toBe(1);
  });

  test("a 500 ms loop needs 3 fps for a second frame, in every delay unit", () => {
    expect(lowestFrameRate({ duration: 500, loop: true }, 30, ms)).toBe(3);
    expect(lowestFrameRate({ duration: 500, loop: true }, 25, cs)).toBe(3);
  });

  test("a timeline that does not loop has its end frame at any rate", () => {
    expect(lowestFrameRate({ duration: 400, loop: false }, 30, ms)).toBe(1);
  });

  test("the highest rate when not even that one samples two frames", () => {
    expect(lowestFrameRate({ duration: 10, loop: true }, 30, ms)).toBe(30);
  });
});
