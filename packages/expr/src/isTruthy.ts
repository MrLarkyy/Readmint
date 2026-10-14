import type { ExprValue } from "./ExprValue.js";

/** Falsy: `false`, `null`, `0`, `""` and the empty array; everything else is truthy. */
export function isTruthy(value: ExprValue): boolean {
  if (value === null || value === false || value === 0 || value === "") return false;
  return !(Array.isArray(value) && value.length === 0);
}
