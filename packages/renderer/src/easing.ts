import type { EasingKeyword } from "@readmint/format";
import { formatNumber } from "./formatNumber.js";

/** An easing as both outputs use it: the CSS text and the control points the frames sample, rounded alike. */
export interface EasingCurve {
  /** `linear`, a keyword or `cubic-bezier(x1,y1,x2,y2)`. */
  readonly css: string;
  /** Undefined for `linear`. */
  readonly points: readonly [x1: number, y1: number, x2: number, y2: number] | undefined;
}

export const linearEasing: EasingCurve = Object.freeze({ css: "linear", points: undefined });

/** The control points CSS Easing Functions Level 1 defines for the keywords. */
const keywords: Readonly<Record<Exclude<EasingKeyword, "linear">, EasingCurve["points"]>> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Bisection steps: the interval shrinks to 2^-48, far below what the 3 printed decimals show. */
const steps = 48;

export function keywordEasing(keyword: EasingKeyword): EasingCurve {
  return keyword === "linear" ? linearEasing : { css: keyword, points: keywords[keyword] };
}

/** Control points rounded to the 3 decimals the CSS prints, so the frames sample the curve the browser plays. */
export function bezierEasing(x1: number, y1: number, x2: number, y2: number): EasingCurve {
  const points = [x1, y1, x2, y2].map((value) => Math.round(value * 1000) / 1000) as [
    number,
    number,
    number,
    number,
  ];
  return { css: `cubic-bezier(${points.map(formatNumber).join(",")})`, points };
}

/**
 * The eased progress at `progress` in [0, 1]. The curve's x is monotonic (x1 and x2 lie in [0, 1]), so a fixed
 * number of bisection steps finds the curve parameter with `+ - * /` only: every engine gets the same bits. Values
 * outside [0, 1] are an overshoot, as in CSS.
 */
export function ease(curve: EasingCurve, progress: number): number {
  if (curve.points === undefined || progress <= 0 || progress >= 1) return progress;
  const [x1, y1, x2, y2] = curve.points;
  let low = 0;
  let high = 1;
  for (let step = 0; step < steps; step++) {
    const middle = (low + high) / 2;
    if (bezier(x1, x2, middle) < progress) low = middle;
    else high = middle;
  }
  return bezier(y1, y2, (low + high) / 2);
}

/** One coordinate of the cubic from 0 to 1 with the inner control coordinates `p1` and `p2`. */
function bezier(p1: number, p2: number, s: number): number {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
}
