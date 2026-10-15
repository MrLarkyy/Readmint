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
