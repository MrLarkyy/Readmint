import { formatNumber } from "./formatNumber.js";
import type { NodeOrbit } from "./NodeOrbit.js";
import { orbitSteps } from "./PlacementStep.js";
import type { RenderContext } from "./RenderContext.js";
import { sampleOrbit } from "./sampleOrbit.js";

/**
 * Writes the groups that put a node on its orbit and runs `draw` inside them, with their steps in the canvas
 * placement. Static transforms in a row share one group's `transform`; a moving orbit's turns each get a group of
 * their own after their static part, holding their sampled turn in a frame and, in the animated SVG, the class that
 * plays it (a CSS transform would replace the static one, so the two never share a group). Moves and turns of 0 are
 * left out.
 */
export function renderOrbit(context: RenderContext, orbit: NodeOrbit, draw: () => void): void {
  const writer = context.writer;
  const css = context.time === undefined ? context.animationCss : undefined;
  const steps = sampleOrbit(orbit, context.time ?? 0);
  let pending: string[] = [];
  let groups = 0;
  const flush = () => {
    if (pending.length === 0) return;
    writer.write(`<g transform="${pending.join(" ")}">`);
    groups++;
    pending = [];
  };
  for (const step of steps) {
    switch (step.kind) {
      case "move":
        if (step.x !== 0 || step.y !== 0)
          pending.push(`translate(${formatNumber(step.x)} ${formatNumber(step.y)})`);
        break;
      case "turn":
        if (step.degrees !== 0) pending.push(`rotate(${formatNumber(step.degrees)})`);
        break;
      case "spin": {
        flush();
        const className =
          css === undefined
            ? ""
            : ` class="${css.className(step.animation, step.animation.tracks)}"`;
        const transform =
          step.degrees === 0 ? "" : ` transform="rotate(${formatNumber(step.degrees)})"`;
        writer.write(`<g${className}${transform}>`);
        groups++;
        break;
      }
    }
  }
  flush();
  context.placement.within(orbitSteps(steps, context.time === undefined), draw);
  if (groups > 0) writer.write("</g>".repeat(groups));
}
