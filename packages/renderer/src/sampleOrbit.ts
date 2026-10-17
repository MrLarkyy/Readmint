import type { NodeAnimation } from "./NodeAnimation.js";
import type { NodeOrbit } from "./NodeOrbit.js";
import { sampleTrack, timelinePosition } from "./sampleAnimation.js";

/**
 * One transform of an orbit at one time, as `renderOrbit` writes it: a move, a static turn, or the relative turn of
 * a moving orbit (its own group, which the CSS of `animation` plays in the animated SVG).
 */
export type OrbitStep =
  | { readonly kind: "move"; readonly x: number; readonly y: number }
  | { readonly kind: "turn"; readonly degrees: number }
  | { readonly kind: "spin"; readonly degrees: number; readonly animation: NodeAnimation };

/**
 * The orbit's transforms at `time` (ms; frame 0 for the animated SVG), outermost first: the drawer and the bounds
 * read the same numbers here. A spin is sampled as the browser plays its CSS keyframes.
 */
export function sampleOrbit(orbit: NodeOrbit, time: number): OrbitStep[] {
  const steps: OrbitStep[] = [];
  for (const part of orbit.parts) {
    if (part.kind === "move") {
      steps.push(part);
      continue;
    }
    steps.push({ kind: "turn", degrees: part.degrees });
    const animation = part.spin;
    const track = animation?.tracks[0];
    if (animation === undefined || track === undefined) continue;
    const degrees = sampleTrack(track, timelinePosition(animation, time))[0] ?? 0;
    steps.push({ kind: "spin", degrees, animation });
  }
  return steps;
}
