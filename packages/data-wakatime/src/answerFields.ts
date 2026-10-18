import { WakaTimeShapeError } from "./WakaTimeShapeError.js";

/** An own property only: a `__proto__` or inherited key of the answer is never read. */
export function own(record: object, key: string): unknown {
  return Object.hasOwn(record, key) ? (record as Record<string, unknown>)[key] : undefined;
}

/** A finite, non-negative number, else a shape error naming `what`. */
export function amount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new WakaTimeShapeError(`${what} is not a non-negative number`);
  }
  return value;
}
