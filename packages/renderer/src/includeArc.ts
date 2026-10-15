/**
 * Adds to a box (through `include`) the end point of an arc from (`x`, `y`) and a box surely containing its ellipse:
 * the ellipse, radii scaled up as SVG does when they cannot reach the end point, has a centre within the largest
 * radius R of both end points, so the arc lies within 2R of each; the bound uses only the chord length (no
 * trigonometry, so every engine computes the same numbers).
 */
export function includeArc(
  include: (x: number, y: number) => void,
  x: number,
  y: number,
  endX: number,
  endY: number,
  rx: number,
  ry: number,
): void {
  include(endX, endY);
  const small = Math.min(rx, ry);
  if (small === 0) return;
  const dx = endX - x;
  const dy = endY - y;
  const halfChord = Math.sqrt(dx * dx + dy * dy) / 2;
  const radius = Math.max(rx, ry) * Math.max(1, halfChord / small);
  include(Math.max(x, endX) - 2 * radius, Math.max(y, endY) - 2 * radius);
  include(Math.min(x, endX) + 2 * radius, Math.min(y, endY) + 2 * radius);
}
