import type { ExprValue } from "./ExprValue.js";

/** The language name of a value type, as error messages use it. */
export function typeName(value: ExprValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
