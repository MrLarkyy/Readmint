import type { AnimatedProperty } from "./NodeAnimation.js";

/** `from` to `to` by `amount`, channel by channel; `amount` outside [0, 1] (an overshoot) extrapolates. */
export function mixValues(
  from: readonly number[],
  to: readonly number[],
  amount: number,
): number[] {
  return from.map((value, index) => value + ((to[index] ?? value) - value) * amount);
}

/**
 * A track value as it is written: clamped where CSS clamps (opacity, colour channels and alpha; transforms and the
 * dash offset are not), then rounded to what the output prints.
 */
export function settleValue(property: AnimatedProperty, value: readonly number[]): number[] {
  if (property === "fill" || property === "stroke") {
    const [r = 0, g = 0, b = 0, a = 1] = value;
    return [channel(r), channel(g), channel(b), round3(Math.min(1, Math.max(0, a)))];
  }
  const [number = 0] = value;
  return [round3(property === "opacity" ? Math.min(1, Math.max(0, number)) : number)];
}

function channel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}
