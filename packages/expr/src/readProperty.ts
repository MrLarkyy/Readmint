import type { ExprValue } from "./ExprValue.js";

export type PropertyRead =
  { readonly ok: true; readonly value: ExprValue } | { readonly ok: false };

const invalid: PropertyRead = Object.freeze({ ok: false });
const missing: PropertyRead = Object.freeze({ ok: true, value: null });

/**
 * The only way the evaluator reads data. An array yields its items by integer index (`length` is
 * not a property), a plain object its own properties; anything else, and anything missing, is
 * `null`. Values are taken from the property descriptor, so a getter is never invoked and nothing
 * is looked up on a prototype.
 */
export function readProperty(target: ExprValue, key: string | number): PropertyRead {
  if (target === null || typeof target !== "object") return missing;
  let ownKey: string | number;
  if (Array.isArray(target)) {
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= target.length) {
      return missing;
    }
    ownKey = key;
  } else if (typeof key === "number") {
    if (!Number.isInteger(key) || key < 0) return missing;
    ownKey = String(key);
  } else {
    ownKey = key;
  }
  return readOwn(target, ownKey);
}

/** Reads an own data property of any object without invoking a getter; absent is `null`. */
export function readOwn(target: object, key: string | number): PropertyRead {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined) return missing;
  if (!Object.hasOwn(descriptor, "value")) return invalid;
  return checkValue(descriptor.value);
}

/**
 * Accepts a JSON value: `null`, a boolean, a finite number, a string, an array or a plain object
 * (prototype `Object.prototype` or `null`). Containers are checked one level deep; their contents
 * are checked when read.
 */
export function checkValue(value: unknown): PropertyRead {
  switch (typeof value) {
    case "string":
    case "boolean":
      return { ok: true, value };
    case "number":
      return Number.isFinite(value) ? { ok: true, value } : invalid;
    case "object": {
      if (value === null) return missing;
      const prototype: unknown = Object.getPrototypeOf(value);
      const plain = Array.isArray(value)
        ? prototype === Array.prototype
        : prototype === Object.prototype || prototype === null;
      return plain ? { ok: true, value: value as ExprValue } : invalid;
    }
    default:
      return invalid;
  }
}
