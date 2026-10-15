import type { LayerBox } from "@readmint/renderer";

/** Where a layer box ends up on the canvas once its turns are applied. */
export interface BoxPlacement {
  /** Centre of the box on the canvas. */
  readonly cx: number;
  readonly cy: number;
  /** Degrees the box is turned in all, clockwise. */
  readonly degrees: number;
  /** Degrees its groups turn it: a drag on the canvas is turned back by this into the layer's coordinates. */
  readonly groupDegrees: number;
}

/** (`x`, `y`) turned by `degrees` clockwise about (`cx`, `cy`). */
export function turnPoint(
  x: number,
  y: number,
  degrees: number,
  cx = 0,
  cy = 0,
): { x: number; y: number } {
  if (degrees === 0) return { x, y };
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** The canvas centre and total turn of a box: its own rotation, then its groups' turns, innermost first. */
export function placeBox(box: LayerBox): BoxPlacement {
  let centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let groupDegrees = 0;
  for (const turn of box.groupTurns ?? []) {
    centre = turnPoint(centre.x, centre.y, turn.degrees, turn.cx, turn.cy);
    groupDegrees += turn.degrees;
  }
  return { cx: centre.x, cy: centre.y, degrees: (box.rotation ?? 0) + groupDegrees, groupDegrees };
}

/** A canvas point in the box's unturned coordinates: its turns undone, outermost first. */
export function unturnPoint(box: LayerBox, x: number, y: number): { x: number; y: number } {
  let point = { x, y };
  for (const turn of [...(box.groupTurns ?? [])].reverse()) {
    point = turnPoint(point.x, point.y, -turn.degrees, turn.cx, turn.cy);
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return turnPoint(point.x, point.y, -(box.rotation ?? 0), cx, cy);
}

/** Whether `degrees` leaves every axis where it was. */
function whole(degrees: number): boolean {
  return degrees % 360 === 0;
}

/**
 * Whether neither the box's own rotation nor any group turn moves its axes: only then do its width and height run
 * along the canvas axes, so corner handles can map a canvas drag to them. Turns that cancel out (90 inside -90) still
 * swap what the layer calls width and height, so they do not count as aligned.
 */
export function axisAligned(box: LayerBox): boolean {
  return whole(box.rotation ?? 0) && (box.groupTurns ?? []).every((turn) => whole(turn.degrees));
}

/** A drag of (`dx`, `dy`) on the canvas in the coordinates the layer's `x`/`y` are given in: its groups' turns undone. */
export function layerDelta(box: LayerBox, dx: number, dy: number): { x: number; y: number } {
  let delta = { x: dx, y: dy };
  for (const turn of [...(box.groupTurns ?? [])].reverse()) {
    if (!whole(turn.degrees)) delta = turnPoint(delta.x, delta.y, -turn.degrees);
  }
  return delta;
}
