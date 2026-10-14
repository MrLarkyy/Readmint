import type { EasingCurve } from "./easing.js";

/** What a track animates; `draw` is the stroke dash offset of a path. */
export type AnimatedProperty =
  "opacity" | "fill" | "stroke" | "draw" | "x" | "y" | "rotation" | "scale";

/** Properties set on the element itself, in output order. */
export const elementProperties: readonly AnimatedProperty[] = ["opacity", "fill", "stroke", "draw"];

/** Properties drawn by a wrapping group each, outermost first. */
export const transformProperties: readonly AnimatedProperty[] = ["x", "y", "rotation", "scale"];

/** A keyframe with its bindings evaluated, at its time on the design's timeline. */
export interface ResolvedKeyframe {
  /** Milliseconds from the start of the timeline. */
  readonly time: number;
  /** One number, or the channels r, g, b (0..255) and the alpha (0..1) of a colour. */
  readonly value: readonly number[];
  /** From this keyframe to the next. */
  readonly easing: EasingCurve;
}

/**
 * A keyframe as the output writes it: the CSS prints these and the frames sample these, so the two cannot drift.
 */
export interface TimelineKeyframe {
  /** Thousandths of a percent of the timeline: an integer in 0..100000, strictly increasing within a track. */
  readonly position: number;
  /** Rounded as written: numbers to 3 decimals, colour channels to integers, alpha to 3 decimals. */
  readonly value: readonly number[];
  readonly easing: EasingCurve;
}

export interface TrackTimeline {
  readonly property: AnimatedProperty;
  /** From 0 to 100000, at least two. */
  readonly keyframes: readonly TimelineKeyframe[];
  /** A colour track with an alpha below 1 somewhere also animates `fill-opacity` or `stroke-opacity`. */
  readonly alpha: boolean;
}

/** The tracks of one node on the design's timeline. */
export interface NodeAnimation {
  /** The timeline's milliseconds. */
  readonly duration: number;
  readonly loop: boolean;
  /** At most one per property, in the order of `elementProperties` then `transformProperties`. */
  readonly tracks: readonly TrackTimeline[];
  /** The dash and gap length of a `draw` track (a little more than the path length). */
  readonly dash: number | undefined;
}
