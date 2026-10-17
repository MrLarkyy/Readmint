const radiansPerDegree = Math.PI / 180;

/**
 * The cosine and sine of `degrees`, computed with + - * / % round only (each exactly specified by IEEE 754, which
 * every engine follows), so Node and every browser get the same bits, unlike `Math.sin` and `Math.cos`: the angle is
 * reduced to within 45 degrees of a quadrant, where Taylor polynomials to x^11 (sine) and x^12 (cosine) are off by
 * under 1e-11. Undefined for a non-finite angle.
 */
export function sinCosDegrees(
  degrees: number,
): { readonly cos: number; readonly sin: number } | undefined {
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
      return { cos, sin };
    case 1:
      return { cos: -sin, sin: cos };
    case 2:
      return { cos: -cos, sin: -sin };
    case 3:
      return { cos: sin, sin: -cos };
  }
}
