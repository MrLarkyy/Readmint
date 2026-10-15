import { describe, expect, test } from "vitest";
import { turnInterval } from "../src/turnInterval.js";

/** Math.cos and Math.sin as the oracle (tests only), on the angle reduced exactly first. */
function oracle(degrees: number): { cos: number; sin: number } {
  const radians = ((degrees % 360) * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

function angles(): number[] {
  const values: number[] = [];
  for (let degrees = -1080; degrees <= 1080; degrees += 0.25) values.push(degrees);
  let seed = 68;
  for (let index = 0; index < 2000; index++) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const unit = seed / 2_147_483_648;
    values.push(index % 2 === 0 ? (unit - 0.5) * 720 : (unit - 0.5) * 2e7);
  }
  values.push(1e9, -1e9, 1e15, -0.0005, 0.0005, 359.9995, -359.9995, 44.9995, 45, 45.0005, -0);
  return values;
}

describe("turnInterval", () => {
  test("holds the true cosine and sine of every finite angle, and stays narrow", () => {
    for (const degrees of angles()) {
      const turn = turnInterval(degrees);
      if (turn === undefined) throw new Error(`no interval for ${String(degrees)}`);
      const { cos, sin } = oracle(degrees);
      expect(turn.cos.lo, `cos ${String(degrees)}`).toBeLessThanOrEqual(cos);
      expect(turn.cos.hi, `cos ${String(degrees)}`).toBeGreaterThanOrEqual(cos);
      expect(turn.sin.lo, `sin ${String(degrees)}`).toBeLessThanOrEqual(sin);
      expect(turn.sin.hi, `sin ${String(degrees)}`).toBeGreaterThanOrEqual(sin);
      expect(turn.cos.hi - turn.cos.lo).toBeLessThanOrEqual(5e-5);
      expect(turn.sin.hi - turn.sin.lo).toBeLessThanOrEqual(5e-5);
    }
  });

  test.each([
    [0, 1, 0],
    [90, 0, 1],
    [180, -1, 0],
    [270, 0, -1],
    [-90, 0, -1],
    [450, 0, 1],
  ])("%s degrees holds cos %s and sin %s exactly", (degrees, cos, sin) => {
    const turn = turnInterval(degrees);
    expect(turn?.cos.lo).toBeLessThanOrEqual(cos);
    expect(turn?.cos.hi).toBeGreaterThanOrEqual(cos);
    expect(turn?.sin.lo).toBeLessThanOrEqual(sin);
    expect(turn?.sin.hi).toBeGreaterThanOrEqual(sin);
  });

  test("covers the angle the SVG prints, rounded to three decimals", () => {
    for (const degrees of [12.3454999, 45.0004999, 89.9995001]) {
      const printed = Math.round(degrees * 1000) / 1000;
      const turn = turnInterval(degrees);
      const { cos, sin } = oracle(printed);
      expect(turn?.cos.lo).toBeLessThanOrEqual(cos);
      expect(turn?.cos.hi).toBeGreaterThanOrEqual(cos);
      expect(turn?.sin.lo).toBeLessThanOrEqual(sin);
      expect(turn?.sin.hi).toBeGreaterThanOrEqual(sin);
    }
  });

  test.each([NaN, Infinity, -Infinity])("%s degrees has no interval", (degrees) => {
    expect(turnInterval(degrees)).toBeUndefined();
  });
});
