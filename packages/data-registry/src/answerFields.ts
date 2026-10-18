import { RegistryShapeError } from "./RegistryShapeError.js";
import { RegistryLimits } from "./RegistrySourceOptions.js";

/** An own property only: a `__proto__` or inherited key of the answer is never read. */
export function own(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}

export function record(value: unknown, what: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryShapeError(`${what} is not an object`);
  }
  return value;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new RegistryShapeError("is not valid JSON");
  }
}

/** Printable ASCII, 1 to 64 characters. */
export function version(value: unknown, what: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > RegistryLimits.versionLength ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new RegistryShapeError(`${what} is not a version`);
  }
  return value;
}

export function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RegistryShapeError(`${what} is not a non-negative whole number`);
  }
  return value;
}

/** `YYYY-MM-DD` of a stored entry. */
export function day(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RegistryShapeError(`${what} is not a date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RegistryShapeError(`${what} is not a date`);
  }
  return value;
}
