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
});

export type ValueRangeName = keyof typeof ValueRanges;
