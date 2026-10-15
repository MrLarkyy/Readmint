import { hexColour } from "./hexColour.js";
import { formatNumber } from "./formatNumber.js";
import {
  transformProperties,
  type AnimatedProperty,
  type NodeAnimation,
  type TrackTimeline,
} from "./NodeAnimation.js";
import type { Paint } from "./paint.js";
import { transformSteps, type PlacementStep } from "./PlacementStep.js";
import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { sampleTrack, sampleTransforms, timelinePosition } from "./sampleAnimation.js";

/** Writes a node without its animation; `extra` goes at the end of its start tag. */
export type NodeDrawer = (context: RenderContext, node: RenderNode, extra: string) => void;

/**
 * An animated node. Its static attributes are the frame at `context.time` (frame 0 when the render is the animated
 * SVG), so a viewer without CSS animation (resvg, reduced motion) shows a correct picture. The animated SVG adds a
 * class per element and per transform group that plays its tracks as CSS (in the groups `playGroups` lists, which
 * `AnimationCss` registered before drawing); a frame writes neither.
 *
 * Transforms never touch the element's own `transform`: one group per animated transform property (x, y, rotation,
 * scale, outermost first) wraps it and its CSS animates only that group's `transform`. With a rotation or scale the
 * groups sit inside `translate(cx cy)` and the element is drawn moved by `-cx -cy`, so they turn around the centre of
 * the laid-out box.
 */
export function renderAnimated(
  context: RenderContext,
  node: RenderNode,
  animation: NodeAnimation,
  draw: NodeDrawer,
): void {
  const writer = context.writer;
  const css = context.time === undefined ? context.animationCss : undefined;
  const position = timelinePosition(animation, context.time ?? 0);
  const classOf = (tracks: readonly TrackTimeline[]) =>
    css === undefined || tracks.length === 0 ? "" : ` class="${css.className(animation, tracks)}"`;

  const sampled = sampleTransforms(node, animation, position);
  const { centre, transforms } = sampled;
  let drawn = node;
  if (centre !== undefined) {
    writer.write(`<g transform="translate(${formatNumber(centre.x)} ${formatNumber(centre.y)})">`);
    drawn = { ...node, x: node.x - centre.x, y: node.y - centre.y };
  }
  for (const { track, value } of transforms) {
    writer.write(`<g${classOf([track])} transform="${transformText(track.property, value)}">`);
  }
  // The animated SVG's CSS moves everything inside, so nothing in it is known to stay off the canvas.
  const steps: PlacementStep[] =
    context.time === undefined ? [{ kind: "unknown" }] : transformSteps(sampled);

  const own = animation.tracks.filter((track) => !transformProperties.includes(track.property));
  let dash = "";
  for (const track of own) {
    const value = sampleTrack(track, position);
    if (track.property === "opacity") drawn = { ...drawn, opacity: value[0] ?? 1 };
    else if (track.property === "draw") {
      const length = formatNumber(animation.dash ?? 0);
      dash = ` stroke-dasharray="${length} ${length}" stroke-dashoffset="${formatNumber(value[0] ?? 0)}"`;
    } else drawn = withPaint(drawn, track.property, colourPaint(value));
  }
  const extra = `${dash}${classOf(own)}`;
  context.placement.within(steps, () => {
    draw(context, drawn, extra);
  });

  const groups = transforms.length + (centre === undefined ? 0 : 1);
  if (groups > 0) writer.write("</g>".repeat(groups));
}

function transformText(property: AnimatedProperty, value: number): string {
  const number = formatNumber(value);
  switch (property) {
    case "x":
      return `translate(${number} 0)`;
    case "y":
      return `translate(0 ${number})`;
    case "rotation":
      return `rotate(${number})`;
    default:
      return `scale(${number})`;
  }
}

function colourPaint(value: readonly number[]): Paint {
  return { kind: "colour", colour: { hex: hexColour(value), alpha: value[3] ?? 1 } };
}

/** The node with its fill or stroke replaced; kinds without that paint stay as they are. */
function withPaint(node: RenderNode, property: AnimatedProperty, paint: Paint): RenderNode {
  switch (node.kind) {
    case "rect":
    case "ellipse":
    case "path":
      return property === "fill" ? { ...node, fill: paint } : { ...node, stroke: paint };
    case "text":
      return property === "fill" ? { ...node, fill: paint } : node;
    default:
      return node;
  }
}
