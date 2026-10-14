import { walkPathData } from "./walkPathData.js";

/** Chords per quadratic or cubic curve: under 0.5 % short for curves a design draws. */
const chords = 32;

/** Above 2π, so the arc bound below never comes out short. */
const twoPiUp = 6.2832;

/**
 * The length of the longest subpath of path data, for drawing a stroke on: SVG engines start the dash pattern again
 * at every subpath (each `M`, and the segment after a `Z`), so every subpath draws from its own start and the longest
 * one sets the pace. Lines count exactly, curves as `chords` chords (a little short), with only `+ - * /` and
 * `Math.sqrt`, which ECMAScript specifies exactly, so every engine gets the same number. Validated designs never draw
 * an arc; one in unvalidated data counts as the perimeter of a circle surely containing it.
 */
export function pathLength(d: string): number {
  let longest = 0;
  let current = 0;
  const end = () => {
    longest = Math.max(longest, current);
    current = 0;
  };
  walkPathData(d, {
    move: end,
    line: (fromX, fromY, x, y) => {
      current += distance(x - fromX, y - fromY);
    },
    quadratic: (fromX, fromY, cx, cy, x, y) => {
      current += flatten((t, u) => [
        u * u * fromX + 2 * u * t * cx + t * t * x,
        u * u * fromY + 2 * u * t * cy + t * t * y,
      ]);
    },
    cubic: (fromX, fromY, c1x, c1y, c2x, c2y, x, y) => {
      current += flatten((t, u) => [
        u * u * u * fromX + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * fromY + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ]);
    },
    arc: (fromX, fromY, rx, ry, x, y) => {
      current += arcBound(x - fromX, y - fromY, rx, ry);
    },
    close: (fromX, fromY, x, y) => {
      current += distance(x - fromX, y - fromY);
      end();
    },
  });
  end();
  return longest;
}

function distance(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Sum of the chords between `chords + 1` points of a curve given as `point(t, 1 - t)`. */
function flatten(point: (t: number, u: number) => readonly [number, number]): number {
  let length = 0;
  let [lastX, lastY] = point(0, 1);
  for (let step = 1; step <= chords; step++) {
    const t = step / chords;
    const [x, y] = point(t, 1 - t);
    length += distance(x - lastX, y - lastY);
    lastX = x;
    lastY = y;
  }
  return length;
}

/** Radii scaled up as SVG does stay below the largest radius times the half chord over the smallest radius. */
function arcBound(dx: number, dy: number, rx: number, ry: number): number {
  const chord = distance(dx, dy);
  const small = Math.min(rx, ry);
  if (small === 0) return chord;
  return twoPiUp * Math.max(rx, ry) * Math.max(1, chord / 2 / small);
}
