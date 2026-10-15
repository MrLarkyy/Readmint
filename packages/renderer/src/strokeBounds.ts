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
 * grown by half the width, and the miter tip of every join. A join next to a direction that is not sure is taken at
 * its longest, twice the width from the vertex: at an arc, a nearly straight curve, a segment too short for its
 * direction to survive single precision or a rasterizer's tolerance, and at the end of the segment after one a
 * rasterizer may skip (it then draws that segment from an earlier point). Only + - * / min max abs and a correctly
 * rounded square root, so every engine computes the same numbers. One pass over `d`; undefined when the data holds
 * no point.
 *
 * Why it holds at any scale: Skia and tiny-skia skip a line shorter than 1/4096 device pixels, but draw a stroke at
 * most 1 device pixel wide as a hairline, without joins. A stroke with joins is wider than 1 device pixel, so a
 * segment of at least 1/1024 of the stroke width is at least 1/1024 device pixels long and is never skipped, however
 * far a group scales the path down.
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
  /** The length below which a direction is not sure, for a segment through `coordinates` `span` long. */
  const tolerance = (span: number, ...coordinates: number[]): number => {
    let reach = 0;
    for (const value of coordinates) reach = Math.max(reach, Math.abs(value));
    return 1 / 64 + strokeWidth / 1024 + span * 1e-3 + reach * 1e-2;
  };

  // The direction the previous segment of the subpath ends in; undefined at the start of a subpath.
  let last: Tangent | undefined;
  // The direction the subpath starts in, for the join a close makes.
  let first: Tangent | undefined;
  // A rasterizer may skip the previous segment, and draw the next one from where that one starts.
  let skippable = false;
  const segment = (fromX: number, fromY: number, start: Tangent, end: Tangent, short: boolean) => {
    if (last === undefined) first = start;
    else join(fromX, fromY, last, start);
    last = skippable ? "unknown" : end;
    skippable = short;
  };
  const restart = () => {
    last = undefined;
    first = undefined;
    skippable = false;
  };

  walkPathData(d, {
    move: (x, y) => {
      point(x, y);
      restart();
    },
    line: (fromX, fromY, x, y) => {
      point(fromX, fromY);
      point(x, y);
      const direction = tangent(x - fromX, y - fromY, tolerance(0, fromX, fromY, x, y));
      segment(fromX, fromY, direction, direction, direction === "unknown");
    },
    quadratic: (fromX, fromY, cx, cy, x, y) => {
      point(fromX, fromY);
      point(cx, cy);
      point(x, y);
      const points = [fromX, fromY, cx, cy, x, y];
      const span = length(cx - fromX, cy - fromY) + length(x - cx, y - cy);
      curve(segment, tolerance(span, ...points), points);
    },
    cubic: (fromX, fromY, c1x, c1y, c2x, c2y, x, y) => {
      point(fromX, fromY);
      point(c1x, c1y);
      point(c2x, c2y);
      point(x, y);
      const points = [fromX, fromY, c1x, c1y, c2x, c2y, x, y];
      const span =
        length(c1x - fromX, c1y - fromY) + length(c2x - c1x, c2y - c1y) + length(x - c2x, y - c2y);
      curve(segment, tolerance(span, ...points), points);
    },
    arc: (fromX, fromY, rx, ry, x, y) => {
      point(fromX, fromY);
      includeArc(point, fromX, fromY, x, y, rx, ry);
      segment(fromX, fromY, "unknown", "unknown", true);
    },
    close: (fromX, fromY, x, y) => {
      if (last !== undefined && first !== undefined) {
        if (fromX === x && fromY === y) {
          join(x, y, last, first);
        } else {
          const direction = skippable
            ? "unknown"
            : tangent(x - fromX, y - fromY, tolerance(0, fromX, fromY, x, y));
          join(fromX, fromY, last, direction);
          join(x, y, direction, first);
        }
      }
      restart();
    },
  });
  return box.minX === Infinity ? undefined : { ...box };
}

/**
 * A curve through `points` (x, y pairs, end points first and last) as a segment: its end directions towards the first
 * control point that differs from the end, as SVG defines them. A nearly straight curve is drawn as lines by Skia and
 * tiny-skia (any point within about 0.3 % of the longest extent from the line through the two farthest points), whose
 * directions and skipping differ: both directions are unknown and the segment may be skipped.
 */
function curve(
  segment: (fromX: number, fromY: number, start: Tangent, end: Tangent, short: boolean) => void,
  limit: number,
  points: readonly number[],
): void {
  const count = points.length / 2;
  const x = (index: number) => points[2 * index] ?? 0;
  const y = (index: number) => points[2 * index + 1] ?? 0;
  if (nearlyStraight(x, y, count)) {
    segment(x(0), y(0), "unknown", "unknown", true);
    return;
  }
  const last = count - 1;
  let start: Tangent = "unknown";
  for (let index = 1; index <= last; index++) {
    const dx = x(index) - x(0);
    const dy = y(index) - y(0);
    if (dx !== 0 || dy !== 0) {
      start = tangent(dx, dy, limit);
      break;
    }
  }
  let end: Tangent = "unknown";
  for (let index = last - 1; index >= 0; index--) {
    const dx = x(last) - x(index);
    const dy = y(last) - y(index);
    if (dx !== 0 || dy !== 0) {
      end = tangent(dx, dy, limit);
      break;
    }
  }
  segment(x(0), y(0), start, end, false);
}

/** Every point within 1 % of the largest extent from the line through the two points farthest apart (per axis). */
function nearlyStraight(
  x: (index: number) => number,
  y: (index: number) => number,
  count: number,
): boolean {
  let extent = -1;
  let from = 0;
  let to = 0;
  for (let index = 0; index < count; index++) {
    for (let other = index + 1; other < count; other++) {
      const size = Math.max(Math.abs(x(other) - x(index)), Math.abs(y(other) - y(index)));
      if (size > extent) {
        extent = size;
        from = index;
        to = other;
      }
    }
  }
  const dx = x(to) - x(from);
  const dy = y(to) - y(from);
  const size = length(dx, dy);
  if (!(size > 0)) return true;
  for (let index = 0; index < count; index++) {
    const off = Math.abs(dx * (y(index) - y(from)) - dy * (x(index) - x(from))) / size;
    if (!(off <= extent * 1e-2)) return false;
  }
  return true;
}

function tangent(dx: number, dy: number, limit: number): Tangent {
  const size = length(dx, dy);
  if (!(size > limit)) return "unknown";
  return { x: dx / size, y: dy / size };
}

function length(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
