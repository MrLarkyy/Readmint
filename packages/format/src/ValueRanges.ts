/** Bounds of a numeric design property; `integer` ranges accept whole numbers only. */
export interface ValueRange {
  readonly integer: boolean;
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly maximum: number;
}

function range(bounds: Omit<ValueRange, "integer">, integer = false): ValueRange {
  return Object.freeze({ integer, ...bounds });
}

/**
 * The numeric ranges of format v0, shared by the schema (literal values) and the renderer (values a binding
 * evaluates to), so the two cannot drift.
 */
export const ValueRanges = Object.freeze({
  position: range({ minimum: -100_000, maximum: 100_000 }),
  size: range({ exclusiveMinimum: 0, maximum: 100_000 }),
  length: range({ minimum: 0, maximum: 100_000 }),
  unit: range({ minimum: 0, maximum: 1 }),
  strokeWidth: range({ minimum: 0, maximum: 1000 }),
  rotation: range({ minimum: -360, maximum: 360 }),
  fontSize: range({ exclusiveMinimum: 0, maximum: 1000 }),
  fontWeight: range({ minimum: 1, maximum: 1000 }, true),
  lineHeight: range({ exclusiveMinimum: 0, maximum: 10 }),
  letterSpacing: range({ minimum: -100, maximum: 100 }),
  canvasSide: range({ minimum: 1, maximum: 4096 }, true),
  columns: range({ minimum: 1, maximum: 1000 }, true),
  /** The lines a text layer draws at most. */
  maxLines: range({ minimum: 1, maximum: 1000 }, true),
  /** Delays and staggers in milliseconds. */
  animationTime: range({ minimum: 0, maximum: 60_000 }, true),
  /** The timeline and track durations in milliseconds. */
  animationDuration: range({ minimum: 1, maximum: 60_000 }, true),
  /** How many times a track plays its keyframes back to back. */
  animationCycles: range({ minimum: 1, maximum: 1000 }, true),
  scale: range({ minimum: -100, maximum: 100 }),
  /** The y coordinates of a cubic-bezier easing; above 1 or below 0 overshoots. */
  easingY: range({ minimum: -10, maximum: 10 }),
  /** Degrees per second along an orbit: ten turns a second either way. */
  orbitSpeed: range({ minimum: -3600, maximum: 3600 }),
  /** Depth on an orbit, the sine of its angle: -1 at the back, 1 at the front. */
  depth: range({ minimum: -1, maximum: 1 }),
});

export type ValueRangeName = keyof typeof ValueRanges;
