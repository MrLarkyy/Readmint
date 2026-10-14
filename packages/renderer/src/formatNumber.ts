/**
 * The only way a number reaches the SVG: rounded to 3 decimals, `-0` printed as `0`. Rounding and `String` are
 * exactly specified by ECMAScript, so Node and every browser print the same digits; values the renderer emits stay
 * far below 1e21, so no exponent appears.
 */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}
