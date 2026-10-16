import { ValueRanges, type Layer, type ValueRange } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { buildTimeline } from "./animationTimeline.js";
import { linearEasing } from "./easing.js";
import type { NodeAnimation, ResolvedKeyframe, TrackTimeline } from "./NodeAnimation.js";
import { minimumOrbitBytes, type NodeOrbit, type OrbitPart } from "./NodeOrbit.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import type { RenderNode } from "./RenderNode.js";
import { resolveBoolean, resolveNumber } from "./resolveValue.js";
import { sinCosDegrees } from "./sinCosDegrees.js";

/** An orbit and what it does to the node's opacity. */
export interface ResolvedOrbit {
  readonly orbit: NodeOrbit;
  /** The node's static opacity, a static fade applied. */
  readonly opacity: number | undefined;
  /** The node's animation, with the opacity track of a moving fade first. */
  readonly animation: NodeAnimation | undefined;
}

/** A fade follows the motion with a keyframe every this many degrees of travel. */
export const fadeStep = 15;

/** Most travel a fade follows: four turns, 97 keyframes. */
export const maxFadeTravel = 1440;

type Fields = Readonly<Record<string, unknown>>;

/**
 * The layer's `orbit` with every binding evaluated for this copy: the transform chain (`NodeOrbit`), and with a
 * `speed` on the design's timeline, a relative rotation track per turn of the chain. A `fade` multiplies the opacity
 * by the depth (the sine of the angle, from the polynomial `sinCosDegrees`, so the CSS and every frame agree): a
 * static orbit at its angle, a moving one as an opacity track with a keyframe every 15 degrees of travel. Undefined
 * without an orbit. `animation` is the node's own, already resolved.
 */
export function resolveOrbit(
  context: RenderContext,
  layer: Layer,
  node: RenderNode,
  animation: NodeAnimation | undefined,
  path: string,
  scope: Scope,
): ResolvedOrbit | undefined {
  const value: unknown = layer.orbit;
  if (value === undefined) return undefined;
  const orbitPath = pointer(path, "orbit");
  const fields = objectAt(context, value, orbitPath, "an orbit");
  const centrePath = pointer(orbitPath, "center");
  const centre = objectAt(context, ownEntry(fields, "center"), centrePath, "an orbit centre");
  const number = (from: Fields, at: string, key: string, range: ValueRange) =>
    resolveNumber(context, ownEntry(from, key), pointer(at, key), range, scope);
  const cx = number(centre, centrePath, "x", ValueRanges.position);
  const cy = number(centre, centrePath, "y", ValueRanges.position);
  const rx = number(fields, orbitPath, "radius", ValueRanges.length);
  const ry =
    ownEntry(fields, "radiusY") === undefined
      ? rx
      : number(fields, orbitPath, "radiusY", ValueRanges.length);
  const angle = rounded(number(fields, orbitPath, "angle", ValueRanges.rotation));
  const upright =
    ownEntry(fields, "upright") === undefined ||
    resolveBoolean(context, ownEntry(fields, "upright"), pointer(orbitPath, "upright"), scope);
  const speed =
    ownEntry(fields, "speed") === undefined
      ? 0
      : number(fields, orbitPath, "speed", ValueRanges.orbitSpeed);
  const motion = resolveMotion(context, speed, scope);

  const spins = new Map<number, NodeAnimation>();
  const turn = (factor: number): OrbitPart => {
    let spin: NodeAnimation | undefined;
    if (motion !== undefined) {
      spin = spins.get(factor) ?? spinAnimation(motion, factor);
      spins.set(factor, spin);
    }
    return { kind: "turn", degrees: factor * angle, spin };
  };
  const centreMove: OrbitPart = { kind: "move", x: cx, y: cy };
  const parts: OrbitPart[] =
    rx === ry
      ? [centreMove, turn(1), { kind: "move", x: rx, y: 0 }, ...(upright ? [turn(-1)] : [])]
      : [
          centreMove,
          turn(1),
          { kind: "move", x: (rx + ry) / 2, y: 0 },
          turn(-2),
          { kind: "move", x: (rx - ry) / 2, y: 0 },
          turn(upright ? 1 : 2),
        ];
  const spinCount = parts.filter((part) => part.kind === "turn" && part.spin !== undefined).length;
  if (spinCount > 0) context.countAnimationKeyframes(pointer(orbitPath, "speed"), 2 * spinCount);
  const written = parts.some((part) =>
    part.kind === "move" ? part.x !== 0 || part.y !== 0 : part.degrees !== 0,
  );
  context.writer.reserve(
    (written ? minimumOrbitBytes.chain : 0) + spinCount * minimumOrbitBytes.spin,
  );

  const orbit: NodeOrbit = { parts, cx, cy, rx, ry };
  const fadeValue = ownEntry(fields, "fade");
  if (fadeValue === undefined) return { orbit, opacity: node.opacity, animation };
  const fadePath = pointer(orbitPath, "fade");
  const fade = resolveFade(context, fadeValue, fadePath);
  if (animation?.tracks.some((track) => track.property === "opacity") === true) {
    context.fail(
      fadePath,
      "type",
      "a fade sets the opacity track, so the layer cannot animate opacity too",
    );
  }
  const base = node.opacity ?? 1;
  if (motion === undefined) {
    const opacity = base * fade(angle);
    return {
      orbit,
      opacity: node.opacity === undefined && opacity === 1 ? undefined : opacity,
      animation,
    };
  }
  const track = fadeTrack(context, motion, angle, fadePath, (degrees) => base * fade(degrees));
  const tracks = [track, ...(animation?.tracks ?? [])];
  const merged: NodeAnimation =
    animation === undefined
      ? { duration: motion.duration, loop: motion.loop, tracks, dash: undefined }
      : { ...animation, tracks };
  return { orbit, opacity: node.opacity, animation: merged };
}

interface Motion {
  readonly duration: number;
  readonly loop: boolean;
  /** Degrees travelled over the timeline, as printed. */
  readonly travel: number;
}

/** The orbit's travel over the design's timeline; undefined when it does not move or there is no timeline. */
function resolveMotion(context: RenderContext, speed: number, scope: Scope): Motion | undefined {
  const timeline = context.design.animation;
  if (speed === 0 || timeline === undefined) return undefined;
  const duration = resolveNumber(
    context,
    timeline.duration,
    "/animation/duration",
    ValueRanges.animationDuration,
    scope,
  );
  const travel = rounded((speed * duration) / 1000);
  return travel === 0 ? undefined : { duration, loop: timeline.loop !== false, travel };
}

/** A linear turn from 0 to `factor` times the travel over the whole timeline. */
function spinAnimation(motion: Motion, factor: number): NodeAnimation {
  const keyframes: ResolvedKeyframe[] = [
    { time: 0, value: [0], easing: linearEasing },
    { time: motion.duration, value: [factor * motion.travel], easing: linearEasing },
  ];
  const track = buildTimeline("rotation", keyframes, motion.duration, () => undefined);
  return { duration: motion.duration, loop: motion.loop, tracks: [track], dash: undefined };
}

/** The fade factor at an angle: 0 at depth `from`, 1 at `to`, linear between and held beyond. */
function resolveFade(
  context: RenderContext,
  value: unknown,
  path: string,
): (degrees: number) => number {
  const fields = objectAt(context, value, path, "an orbit fade");
  const depth = (key: "from" | "to") => {
    const at = pointer(path, key);
    const number = ownEntry(fields, key);
    const range = ValueRanges.depth;
    if (typeof number !== "number" || !Number.isFinite(number))
      context.fail(at, "type", "expected a number");
    if (number < (range.minimum ?? -Infinity) || number > range.maximum)
      context.fail(at, "range", `${String(number)} is outside [-1, 1]`);
    return number;
  };
  const from = depth("from");
  const to = depth("to");
  if (from === to)
    context.fail(pointer(path, "to"), "range", "a fade needs different from and to depths");
  return (degrees) => {
    const sine = sinCosDegrees(degrees)?.sin ?? 0;
    return Math.min(1, Math.max(0, (sine - from) / (to - from)));
  };
}

/** The opacity at every 15 degrees of the travel, linear between: what the CSS plays and the frames sample. */
function fadeTrack(
  context: RenderContext,
  motion: Motion,
  angle: number,
  path: string,
  opacityAt: (degrees: number) => number,
): TrackTimeline {
  const distance = Math.abs(motion.travel);
  if (distance > maxFadeTravel) {
    context.fail(
      path,
      "range",
      `a fade follows at most ${String(maxFadeTravel)} degrees of travel over the timeline, the orbit travels ${String(distance)}`,
    );
  }
  const steps = Math.max(1, Math.ceil(distance / fadeStep));
  context.countAnimationKeyframes(path, steps + 1);
  const keyframes: ResolvedKeyframe[] = [];
  for (let step = 0; step <= steps; step++) {
    keyframes.push({
      time: (motion.duration * step) / steps,
      value: [opacityAt(angle + (motion.travel * step) / steps)],
      easing: linearEasing,
    });
  }
  return buildTimeline("opacity", keyframes, motion.duration, () => undefined);
}

function objectAt(context: RenderContext, value: unknown, path: string, label: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    context.fail(path, "type", `expected ${label}`);
  return value as Fields;
}

/** As `formatNumber` prints it, so the multiples the chain writes cancel exactly. */
function rounded(value: number): number {
  const result = Math.round(value * 1000) / 1000;
  return result === 0 ? 0 : result;
}
