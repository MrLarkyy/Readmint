import { includeArc } from "./includeArc.js";
import type { Bounds } from "./pathBounds.js";
import { walkPathData } from "./walkPathData.js";

/** A unit direction, or `unknown` where a rasterizer may take another one (an arc, a vanishing segment). */
type Tangent = { readonly x: number; readonly y: number } | "unknown";

/**
 * `stroke-miterlimit` 4 (the renderer writes none) draws a miter while 1 + cos(turn) >= 2 / 4². Joins just below are
 * counted as miters too: a rasterizer computes the turn in single precision.
 */
const miterFloor = 0.125 * (1 - 1e-3);

/** Covers the single precision directions a rasterizer computes the miter tip from. */
const tipSlack = 1 + 1e-3;

/**
 * A box surely containing the stroke of path data `d` drawn `strokeWidth` wide with butt caps and miter joins (what
 * the renderer writes): the hull of the end and control points, an arc by the box of its ellipse (as `pathBounds`),
 * grown by half the width, and the miter tip of every join. A join next to a direction that is not sure (an arc, a
 * segment too short for its direction to survive single precision or a rasterizer's tolerance) is taken at its
 * longest, twice the width from the vertex. Only + - * / min max abs and a correctly rounded square root, so every
 * engine computes the same numbers. One pass over `d`; undefined when the data holds no point.
 */
export function strokeBounds(d: string, strokeWidth: number): Bounds | undefined {
  const half = strokeWidth / 2;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const include = (x: number, y: number, byX: number, byY: number) => {
    if (x - byX < box.minX) box.minX = x - byX;
    if (x + byX > box.maxX) box.maxX = x + byX;
    if (y - byY < box.minY) box.minY = y - byY;
    if (y + byY > box.maxY) box.maxY = y + byY;
  };
  const point = (x: number, y: number) => {
    include(x, y, half, half);
  };
  const join = (x: number, y: number, into: Tangent, out: Tangent) => {
    if (into === "unknown" || out === "unknown") {
      include(x, y, 2 * strokeWidth, 2 * strokeWidth);
      return;
    }
    const turn = 1 + into.x * out.x + into.y * out.y;
    // Below the floor the join is a bevel, within half the width of the vertex.
    if (!(turn >= miterFloor)) return;
    // The tip lies half the width along the sum of the two normals, divided by 1 + cos(turn).
    const reach = (half * tipSlack) / turn;
    include(x, y, reach * Math.abs(into.y + out.y), reach * Math.abs(into.x + out.x));
  };

  // The direction the previous segment of the subpath ends in; undefined at the start of a subpath.
  let last: Tangent | undefined;
  // The direction the subpath starts in, for the join a close makes.
  let first: Tangent | undefined;
  const segment = (fromX: number, fromY: number, start: Tangent, end: Tangent) => {
    if (last === undefined) first = start;
    else join(fromX, fromY, last, start);
    last = end;
  };

  walkPathData(d, {
    move: (x, y) => {
      point(x, y);
      last = undefined;
      first = undefined;
    },
    line: (fromX, fromY, x, y) => {
      point(fromX, fromY);
      point(x, y);
      const direction = tangent(x - fromX, y - fromY, tolerance(0, fromX, fromY, x, y));
      segment(fromX, fromY, direction, direction);
    },
    quadratic: (fromX, fromY, cx, cy, x, y) => {
      point(fromX, fromY);
      point(cx, cy);
      point(x, y);
      const span = length(cx - fromX, cy - fromY) + length(x - cx, y - cy);
      const limit = tolerance(span, fromX, fromY, cx, cy, x, y);
      segment(
        fromX,
        fromY,
        firstDirection(limit, [cx - fromX, cy - fromY], [x - fromX, y - fromY]),
        firstDirection(limit, [x - cx, y - cy], [x - fromX, y - fromY]),
      );
    },
    cubic: (fromX, fromY, c1x, c1y, c2x, c2y, x, y) => {
      point(fromX, fromY);
      point(c1x, c1y);
      point(c2x, c2y);
      point(x, y);
      const span =
        length(c1x - fromX, c1y - fromY) + length(c2x - c1x, c2y - c1y) + length(x - c2x, y - c2y);
      const limit = tolerance(span, fromX, fromY, c1x, c1y, c2x, c2y, x, y);
      segment(
        fromX,
        fromY,
        firstDirection(
          limit,
          [c1x - fromX, c1y - fromY],
          [c2x - fromX, c2y - fromY],
          [x - fromX, y - fromY],
        ),
        firstDirection(limit, [x - c2x, y - c2y], [x - c1x, y - c1y], [x - fromX, y - fromY]),
      );
    },
    arc: (fromX, fromY, rx, ry, x, y) => {
      point(fromX, fromY);
      includeArc(point, fromX, fromY, x, y, rx, ry);
      segment(fromX, fromY, "unknown", "unknown");
    },
    close: (fromX, fromY, x, y) => {
      if (last !== undefined && first !== undefined) {
        if (fromX === x && fromY === y) {
          join(x, y, last, first);
        } else {
          const direction = tangent(x - fromX, y - fromY, tolerance(0, fromX, fromY, x, y));
          join(fromX, fromY, last, direction);
          join(x, y, direction, first);
        }
      }
      last = undefined;
      first = undefined;
    },
  });
  return box.minX === Infinity ? undefined : { ...box };
}

/**
 * The length below which a segment's direction is not sure: Skia (and tiny-skia) skip a vector shorter than 1/4096
 * path units at scale 1; single precision coordinates move a direction by about 1e-7 times their size over its length;
 * a curve's end direction from a control point very close to the end may be taken from the next one.
 */
function tolerance(span: number, ...coordinates: number[]): number {
  let reach = 0;
  for (const value of coordinates) reach = Math.max(reach, Math.abs(value));
  return 1 / 64 + span * 1e-3 + reach * 1e-2;
}

function tangent(dx: number, dy: number, limit: number): Tangent {
  const size = length(dx, dy);
  if (!(size > limit)) return "unknown";
  return { x: dx / size, y: dy / size };
}

/** The direction at a curve's end, as SVG defines it: towards the first control point that differs from the end. */
function firstDirection(limit: number, ...candidates: (readonly [number, number])[]): Tangent {
  for (const [dx, dy] of candidates) {
    if (dx !== 0 || dy !== 0) return tangent(dx, dy, limit);
  }
  return "unknown";
}

function length(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
