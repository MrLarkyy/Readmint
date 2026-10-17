import { expect, test } from "vitest";
import { sinCosDegrees } from "../src/sinCosDegrees.js";
import { turnInterval } from "../src/turnInterval.js";

const angles = [
  ...Array.from({ length: 721 }, (_, index) => index - 360),
  0.0005,
  -89.9995,
  137.25,
  -1e-9,
  359.999,
  1e6 + 0.5,
];

test("the cosine and sine of an angle in degrees are within 1e-11 of Math's", () => {
  for (const degrees of angles) {
    const turn = sinCosDegrees(degrees);
    const radians = ((degrees % 360) * Math.PI) / 180;
    expect(Math.abs((turn?.cos ?? 9) - Math.cos(radians)), String(degrees)).toBeLessThan(1e-11);
    expect(Math.abs((turn?.sin ?? 9) - Math.sin(radians)), String(degrees)).toBeLessThan(1e-11);
  }
});

test("quarter turns are exact and a non-finite angle has none", () => {
  expect(sinCosDegrees(90)).toEqual({ cos: -0, sin: 1 });
  expect(sinCosDegrees(-180)).toEqual({ cos: -1, sin: -0 });
  expect(sinCosDegrees(Number.NaN)).toBeUndefined();
  expect(sinCosDegrees(Infinity)).toBeUndefined();
});

test("the turn interval holds the polynomial values with its slack", () => {
  for (const degrees of angles) {
    const turn = sinCosDegrees(degrees);
    const interval = turnInterval(degrees);
    if (turn === undefined || interval === undefined) throw new Error(String(degrees));
    expect(interval.cos.lo).toBeLessThanOrEqual(turn.cos);
    expect(interval.cos.hi).toBeGreaterThanOrEqual(turn.cos);
    expect(interval.sin.lo).toBeLessThanOrEqual(turn.sin);
    expect(interval.sin.hi).toBeGreaterThanOrEqual(turn.sin);
    expect(interval.sin.hi - interval.sin.lo).toBeLessThan(4.0001e-5);
  }
});
