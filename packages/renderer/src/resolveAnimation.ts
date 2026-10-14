import {
  ValueRanges,
  type AnimationTrack,
  type Easing,
  type Layer,
  type ValueRange,
} from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { buildTimeline } from "./animationTimeline.js";
import { bezierEasing, keywordEasing, linearEasing, type EasingCurve } from "./easing.js";
import {
  elementProperties,
  transformProperties,
  type AnimatedProperty,
  type NodeAnimation,
  type ResolvedKeyframe,
  type TrackTimeline,
} from "./NodeAnimation.js";
import { ownEntry } from "./ownEntry.js";
import { pathLength } from "./pathLength.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { echo, resolveColour, resolveNumber, resolveOptionalNumber } from "./resolveValue.js";

const order: readonly AnimatedProperty[] = [...elementProperties, ...transformProperties];

const numberRanges: Readonly<Record<AnimatedProperty, ValueRange | undefined>> = {
  opacity: ValueRanges.unit,
  draw: ValueRanges.unit,
  x: ValueRanges.position,
  y: ValueRanges.position,
  rotation: ValueRanges.rotation,
  scale: ValueRanges.scale,
  fill: undefined,
  stroke: undefined,
};

/** Properties each kind of node takes; a track the format does not allow on the kind is never drawn. */
const accepted: Readonly<Record<RenderNode["kind"], ReadonlySet<AnimatedProperty>>> = {
  group: new Set(transformProperties.concat("opacity")),
  image: new Set(transformProperties.concat("opacity")),
  rect: new Set(transformProperties.concat("opacity", "fill", "stroke")),
  ellipse: new Set(transformProperties.concat("opacity", "fill", "stroke")),
  path: new Set(transformProperties.concat("opacity", "fill", "stroke", "draw")),
  text: new Set(transformProperties.concat("opacity", "fill")),
};

/**
 * Least output bytes a track adds in either output (a frame writes no class and no CSS): its wrapping group, or the
 * dash attributes of `draw`. Reserved before the node is written, as `minimumNodeBytes` is.
 */
export const minimumTrackBytes: Readonly<Record<AnimatedProperty, number>> = {
  opacity: 0,
  fill: 0,
  stroke: 0,
  draw: ' stroke-dasharray="0 0" stroke-dashoffset="0"'.length,
  x: '<g transform="translate(0 0)"></g>'.length,
  y: '<g transform="translate(0 0)"></g>'.length,
  rotation: '<g transform="rotate(0)"></g>'.length,
  scale: '<g transform="scale(1)"></g>'.length,
};

const maxKeyframes = 32;

/**
 * The tracks of a layer's `animate` with every binding evaluated for this copy and mapped onto the design's
 * timeline; undefined without a timeline or tracks. `copy` is the index of the layer's own repeat: `stagger` adds
 * to `delay` once per index.
 */
export function resolveAnimation(
  context: RenderContext,
  layer: Layer,
  node: RenderNode,
  path: string,
  scope: Scope,
  copy: number,
): NodeAnimation | undefined {
  const timeline = context.design.animation;
  const animate = layer.animate as Readonly<Record<string, AnimationTrack<unknown>>> | undefined;
  if (timeline === undefined || animate === undefined) return undefined;
  const duration = resolveNumber(
    context,
    timeline.duration,
    "/animation/duration",
    ValueRanges.animationDuration,
    scope,
  );
  const animatePath = pointer(path, "animate");
  const tracks: TrackTimeline[] = [];
  let dash: number | undefined;
  for (const property of order) {
    const track = ownEntry(animate, property);
    if (track === undefined || !accepted[node.kind].has(property)) continue;
    if (property === "draw") {
      if (node.kind !== "path") continue;
      dash = dashLength(context, node.d, path, pointer(animatePath, property));
    }
    const trackPath = pointer(animatePath, property);
    const keyframes = resolveTrack(
      context,
      track,
      property,
      trackPath,
      scope,
      copy,
      duration,
      dash,
    );
    tracks.push(
      buildTimeline(property, keyframes, duration, () => {
        warnCut(context, trackPath, duration);
      }),
    );
    context.writer.reserve(minimumTrackBytes[property]);
  }
  if (tracks.length === 0) return undefined;
  return { duration, loop: timeline.loop !== false, tracks, dash };
}

function resolveTrack(
  context: RenderContext,
  track: AnimationTrack<unknown>,
  property: AnimatedProperty,
  path: string,
  scope: Scope,
  copy: number,
  timeline: number,
  dash: number | undefined,
): ResolvedKeyframe[] {
  const time = (key: "delay" | "stagger") =>
    resolveOptionalNumber(
      context,
      track[key],
      pointer(path, key),
      ValueRanges.animationTime,
      scope,
    ) ?? 0;
  const duration =
    resolveOptionalNumber(
      context,
      track.duration,
      pointer(path, "duration"),
      ValueRanges.animationDuration,
      scope,
    ) ?? timeline;
  const start = time("delay") + time("stagger") * copy;
  const trackEasing = resolveEasing(context, track.easing, pointer(path, "easing")) ?? linearEasing;
  const keyframesPath = pointer(path, "keyframes");
  const list: unknown = track.keyframes;
  if (!Array.isArray(list) || list.length < 2 || list.length > maxKeyframes) {
    context.fail(keyframesPath, "type", `a track needs 2 to ${String(maxKeyframes)} keyframes`);
  }
  let previous = 0;
  return (list as AnimationTrack<unknown>["keyframes"]).map((keyframe, index) => {
    const at = pointer(keyframesPath, index);
    const offset = resolveNumber(
      context,
      keyframe.offset,
      pointer(at, "offset"),
      ValueRanges.unit,
      scope,
    );
    if (offset < previous) {
      context.fail(pointer(at, "offset"), "range", "keyframe offsets must not decrease");
    }
    previous = offset;
    return {
      time: start + offset * duration,
      value: resolveValue(context, property, keyframe.value, pointer(at, "value"), scope, dash),
      easing: resolveEasing(context, keyframe.easing, pointer(at, "easing")) ?? trackEasing,
    };
  });
}

/** A number in the property's range, a colour as r, g, b, alpha, or for `draw` the dash offset it needs. */
function resolveValue(
  context: RenderContext,
  property: AnimatedProperty,
  value: unknown,
  path: string,
  scope: Scope,
  dash: number | undefined,
): number[] {
  const range = numberRanges[property];
  if (range === undefined) {
    const colour = resolveColour(context, value, path, scope);
    const channels = [1, 3, 5].map((start) =>
      Number.parseInt(colour.hex.slice(start, start + 2), 16),
    );
    return [...channels, colour.alpha];
  }
  const number = resolveNumber(context, value, path, range, scope);
  return [property === "draw" ? (dash ?? 0) * (1 - number) : number];
}

const keywordNames: ReadonlySet<unknown> = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

function resolveEasing(
  context: RenderContext,
  easing: unknown,
  path: string,
): EasingCurve | undefined {
  if (easing === undefined) return undefined;
  if (typeof easing === "string" && keywordNames.has(easing))
    return keywordEasing(easing as Exclude<Easing, object>);
  if (typeof easing !== "object" || easing === null || Array.isArray(easing)) {
    context.fail(path, "type", `expected an easing keyword or cubic-bezier, got ${echo(easing)}`);
  }
  const points = easing as Readonly<Record<string, unknown>>;
  const coordinate = (key: "x1" | "y1" | "x2" | "y2") => {
    const value = ownEntry(points, key);
    const range = key.startsWith("x") ? ValueRanges.unit : ValueRanges.easingY;
    if (typeof value !== "number") context.fail(pointer(path, key), "type", "expected a number");
    return checkLiteral(context, value, pointer(path, key), range);
  };
  return bezierEasing(coordinate("x1"), coordinate("y1"), coordinate("x2"), coordinate("y2"));
}

function checkLiteral(
  context: RenderContext,
  value: number,
  path: string,
  range: ValueRange,
): number {
  if (!Number.isFinite(value) || value < (range.minimum ?? -Infinity) || value > range.maximum) {
    context.fail(path, "range", `${String(value)} is outside its range`);
  }
  return value;
}

/** Longest stroke a `draw` track takes, so the dash numbers print without an exponent. */
const maxDash = 1e9;

/** Dash and gap of a stroke drawn on: the longest subpath (chords run a little short) plus a margin. */
function dashLength(context: RenderContext, d: string, path: string, trackPath: string): number {
  let length = context.pathLengths.get(path);
  if (length === undefined) {
    length = pathLength(d);
    context.pathLengths.set(path, length);
  }
  const dash = Math.ceil((length * 1.01 + 1) * 1000) / 1000;
  if (!(dash <= maxDash)) {
    context.fail(
      trackPath,
      "range",
      `the path is too long to draw on (more than ${String(maxDash)})`,
    );
  }
  return dash;
}

function warnCut(context: RenderContext, path: string, duration: number): void {
  if (context.cutTracks.has(path)) return;
  context.cutTracks.add(path);
  context.warn(
    path,
    "animation-cut",
    `the track runs past the end of the ${String(duration)} ms timeline and is cut there`,
  );
}
