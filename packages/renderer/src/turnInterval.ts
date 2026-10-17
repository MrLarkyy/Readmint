import { sinCosDegrees } from "./sinCosDegrees.js";

/** A closed range of numbers, `lo` at most `hi`. */
export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

/**
 * Covers the printed angle (three decimals of a degree), single precision trigonometry and angles in rasterizers,
 * and the polynomial and rounding error of `sinCosDegrees`, which are all far smaller.
 */
const slack = 2e-5;

/**
 * Intervals surely holding the cosine and sine of `degrees`, the same bits in Node and every browser
 * (`sinCosDegrees`). Undefined for a non-finite angle.
 */
export function turnInterval(
  degrees: number,
): { readonly cos: Interval; readonly sin: Interval } | undefined {
  const turn = sinCosDegrees(degrees);
  if (turn === undefined) return undefined;
  return { cos: around(turn.cos), sin: around(turn.sin) };
}

function around(value: number): Interval {
  return { lo: Math.max(-1, value - slack), hi: Math.min(1, value + slack) };
}
