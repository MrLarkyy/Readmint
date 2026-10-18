import type { ExprValue } from "./ExprValue.js";
import { budgetFailure, failure, itemSteps, keyArgument, success } from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import { numberItem } from "./numberItem.js";
import { readProperty } from "./readProperty.js";
import { textSteps } from "./textSteps.js";
import { typeName } from "./typeName.js";

type Scalar = string | number | boolean | null;

function isScalar(value: ExprValue): value is Scalar {
  return value === null || typeof value !== "object";
}

/** Hashing or comparing a string walks it: what that costs on top of the step its item already paid. */
function stringSteps(value: Scalar): number {
  return typeof value === "string" ? textSteps(value.length) - 1 : 0;
}

/**
 * `list | exclude(key, values)`: the items whose own property `key` (the item itself for a `null` key) is not strictly
 * equal to an item of `values`. A new array; the input is never changed.
 */
const exclude: FilterDefinition = {
  minArgs: 2,
  maxArgs: 2,
  apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
    if (!Array.isArray(input))
      return failure("type", `exclude needs an array, got ${typeName(input)}`);
    const key = keyArgument("exclude", args, 0);
    if (!key.ok) return key;
    const values = args[1] ?? null;
    if (!Array.isArray(values)) return failure("argument", "exclude: argument 2 must be an array");
    if (!context.charge(itemSteps(input.length, key.value) + values.length)) return budgetFailure();
    // A Set compares like `===` for JSON scalars (SameValueZero differs only on NaN, which data never holds).
    const excluded = new Set<Scalar>();
    for (let index = 0; index < values.length; index++) {
      const value = readProperty(values, index);
      if (!value.ok) return failure("invalid-data", "exclude: a value is not a JSON value");
      if (!isScalar(value.value)) {
        return failure(
          "argument",
          "exclude: argument 2 must hold strings, numbers, booleans or null",
        );
      }
      if (!context.charge(stringSteps(value.value))) return budgetFailure();
      excluded.add(value.value);
    }
    const kept: ExprValue[] = [];
    for (let index = 0; index < input.length; index++) {
      const item = readProperty(input, index);
      if (!item.ok) return failure("invalid-data", "exclude: an item is not a JSON value");
      let compared = item.value;
      if (key.value !== null) {
        if (compared === null || typeof compared !== "object" || Array.isArray(compared)) {
          return failure("type", `exclude: items must be objects, got ${typeName(compared)}`);
        }
        const property = readProperty(compared, key.value);
        if (!property.ok) return failure("invalid-data", "exclude: an item is not a JSON value");
        compared = property.value;
      }
      if (isScalar(compared)) {
        if (!context.charge(stringSteps(compared))) return budgetFailure();
        if (excluded.has(compared)) continue;
      }
      kept.push(item.value);
    }
    return success(kept);
  },
};

/** `list | sum` adds the numbers of an array left to right, `list | sum(key)` a number property of its objects. */
const sum: FilterDefinition = {
  minArgs: 0,
  maxArgs: 1,
  apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
    if (!Array.isArray(input)) return failure("type", `sum needs an array, got ${typeName(input)}`);
    const key = keyArgument("sum", args, 0);
    if (!key.ok) return key;
    if (!context.charge(itemSteps(input.length, key.value))) return budgetFailure();
    let total = 0;
    for (let index = 0; index < input.length; index++) {
      const number = numberItem("sum", input, index, key.value);
      if (!number.ok) return number;
      total += number.value;
    }
    if (!Number.isFinite(total))
      return failure("not-finite", "sum: the result is out of the number range");
    return success(total);
  },
};

export const listFilters: Readonly<Record<string, FilterDefinition>> = { exclude, sum };
