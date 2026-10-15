/** A closed range of numbers, `lo` at most `hi`. */
export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

/**
 * Covers the printed angle (three decimals of a degree), single precision trigonometry and angles in rasterizers,
 * and the polynomial and rounding error here, which are all far smaller.
 */
const slack = 2e-5;

const radiansPerDegree = Math.PI / 180;

/**
 * Intervals surely holding the cosine and sine of `degrees`, computed with + - * / % round only (each exactly specified
 * by IEEE 754, which every engine follows), so Node and every browser get the same bits: the angle is reduced to
 * within 45 degrees of a quadrant, where Taylor polynomials to x^11 (sine) and x^12 (cosine) are off by under 1e-11.
 * Undefined for a non-finite angle.
 */
export function turnInterval(
  degrees: number,
): { readonly cos: Interval; readonly sin: Interval } | undefined {
  if (!Number.isFinite(degrees)) return undefined;
  const reduced = degrees % 360;
  const quadrant = Math.round(reduced / 90);
  const x = (reduced - 90 * quadrant) * radiansPerDegree;
  const x2 = x * x;
  const sin =
    x *
    (1 +
      x2 *
        (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362_880 + x2 * (-1 / 39_916_800))))));
  const cos =
    1 +
    x2 *
      (-1 / 2 +
        x2 *
          (1 / 24 +
            x2 * (-1 / 720 + x2 * (1 / 40_320 + x2 * (-1 / 3_628_800 + x2 * (1 / 479_001_600))))));
  switch ((((quadrant % 4) + 4) % 4) as 0 | 1 | 2 | 3) {
    case 0:
      return { cos: around(cos), sin: around(sin) };
    case 1:
      return { cos: around(-sin), sin: around(cos) };
    case 2:
      return { cos: around(-cos), sin: around(-sin) };
    case 3:
      return { cos: around(sin), sin: around(-cos) };
  }
}

function around(value: number): Interval {
  return { lo: Math.max(-1, value - slack), hi: Math.min(1, value + slack) };
}
