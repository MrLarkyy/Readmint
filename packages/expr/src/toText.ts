import type { ExprValue } from "./ExprValue.js";

/** How a value is written into text: `undefined` for an array or an object, which have no text form. */
export function toText(value: ExprValue): string | undefined {
  if (value === null) return "";
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    default:
      return undefined;
  }
}
