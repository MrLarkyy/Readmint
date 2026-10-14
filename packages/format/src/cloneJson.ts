import { isPlainObject } from "./isPlainObject.js";

/**
 * Deep copy of arrays and plain objects; other values are shared. Keys are defined, never
 * assigned, so an own `__proto__` key stays data. Callers bound depth first (`measureValue`).
 */
export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneJson(item)) as T;
  if (!isPlainObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneJson(value[key]),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return copy as T;
}
