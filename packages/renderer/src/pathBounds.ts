import { includeArc } from "./includeArc.js";
import { walkPathData } from "./walkPathData.js";

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * A box containing the path, for layout only: the hull of every end and control point; an arc adds a box that
 * surely contains its ellipse (no trigonometry, so every engine computes the same numbers). One pass over `d`.
 * Undefined when the data holds no point.
 */
export function pathBounds(d: string): Bounds | undefined {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const include = (x: number, y: number) => {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  };
  walkPathData(d, {
    move: include,
    line: (_fromX, _fromY, x, y) => {
      include(x, y);
    },
    quadratic: (_fromX, _fromY, cx, cy, x, y) => {
      include(cx, cy);
      include(x, y);
    },
    cubic: (_fromX, _fromY, c1x, c1y, c2x, c2y, x, y) => {
      include(c1x, c1y);
      include(c2x, c2y);
      include(x, y);
    },
    arc: (fromX, fromY, rx, ry, x, y) => {
      includeArc(include, fromX, fromY, x, y, rx, ry);
    },
    close: () => undefined,
  });
  return finish(box);
}

function finish(box: Bounds): Bounds | undefined {
  return box.minX === Infinity ? undefined : { ...box };
}
