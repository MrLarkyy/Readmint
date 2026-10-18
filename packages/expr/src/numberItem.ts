import type { ExprValue } from "./ExprValue.js";
import { failure, type Checked } from "./filterArguments.js";
import { readProperty } from "./readProperty.js";
import { typeName } from "./typeName.js";

/**
 * Item `index` of an array as a number, or with a string `key` the number property `key` of that item, which must be
 * an object; read like `.key`, never through a getter or a prototype. Errors name the filter, never a value.
 */
export function numberItem(
  name: string,
  input: readonly ExprValue[],
  index: number,
  key: string | null,
): Checked<number> {
  const item = readProperty(input, index);
  if (!item.ok) return failure("invalid-data", `${name}: an item is not a JSON value`);
  let number = item.value;
  if (key !== null) {
    if (number === null || typeof number !== "object" || Array.isArray(number)) {
      return failure("type", `${name}: items must be objects, got ${typeName(number)}`);
    }
    const property = readProperty(number, key);
    if (!property.ok) return failure("invalid-data", `${name}: an item is not a JSON value`);
    number = property.value;
    if (typeof number !== "number") {
      return failure("type", `${name}: item properties must be numbers, got ${typeName(number)}`);
    }
  } else if (typeof number !== "number") {
    return failure("type", `${name}: items must be numbers, got ${typeName(number)}`);
  }
  return { ok: true, value: number };
}
