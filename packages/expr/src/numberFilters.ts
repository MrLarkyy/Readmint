import {
  budgetFailure,
  failure,
  integerArgument,
  localeArgument,
  numberArgument,
  numberInput,
  success,
} from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import { formatCompact, formatNumber, formatPercent } from "./formatNumber.js";
import type { ExprValue } from "./ExprValue.js";
import type { LocaleData } from "./LocaleData.js";
import { readProperty } from "./readProperty.js";
import { textSteps } from "./textSteps.js";
import { typeName } from "./typeName.js";

const maxDecimals = 20;

type Formatter = (value: number, decimals: number, locale: LocaleData) => string;

/** `scale` is what `format` multiplies by; a product past the number range is `not-finite`. */
function formatting(
  name: string,
  format: Formatter,
  defaultDecimals: number,
  scale = 1,
): FilterDefinition {
  return {
    minArgs: 0,
    maxArgs: 2,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const value = numberInput(name, input);
      if (!value.ok) return value;
      if (!Number.isFinite(value.value * scale)) {
        return failure("not-finite", `${name}: the result is out of the number range`);
      }
      const decimals = integerArgument(name, args, 0, {
        fallback: defaultDecimals,
        min: 0,
        max: maxDecimals,
      });
      if (!decimals.ok) return decimals;
      const locale = localeArgument(name, args, 1, context);
      if (!locale.ok) return locale;
      return success(format(value.value, decimals.value, locale.value));
    },
  };
}

function math(name: string, operation: (value: number) => number): FilterDefinition {
  return {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue): FilterOutcome {
      const value = numberInput(name, input);
      return value.ok ? success(operation(value.value)) : value;
    },
  };
}

/** `n | min(b)` bounds a number; `list | min` is the extremum of an array, `list | min("key")` of a number property of its objects. */
function boundOrExtremum(
  name: string,
  operation: (value: number, limit: number) => number,
): FilterDefinition {
  return {
    minArgs: 0,
    maxArgs: 1,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      if (Array.isArray(input)) return extremum(name, operation, input, args, context);
      if (typeof input !== "number") {
        return failure("type", `${name} needs a number or an array, got ${typeName(input)}`);
      }
      if (args.length === 0) return failure("argument", `${name}: argument 1 is required`);
      const limit = numberArgument(name, args, 0);
      return limit.ok ? success(operation(input, limit.value)) : limit;
    },
  };
}

function extremum(
  name: string,
  operation: (value: number, limit: number) => number,
  input: readonly ExprValue[],
  args: readonly ExprValue[],
  context: FilterContext,
): FilterOutcome {
  const key = args[0] ?? null;
  if (key !== null && typeof key !== "string") {
    return failure("argument", `${name}: argument 1 must be a string`);
  }
  const cost = key === null ? input.length : input.length + textSteps(key.length);
  if (!context.charge(cost)) return budgetFailure();
  let result: number | null = null;
  for (let index = 0; index < input.length; index++) {
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
    result = result === null ? number : operation(result, number);
  }
  return success(result);
}

export const numberFilters: Readonly<Record<string, FilterDefinition>> = {
  number: formatting("number", formatNumber, 0),
  compact: formatting("compact", formatCompact, 1),
  percent: formatting("percent", formatPercent, 0, 100),
  round: {
    minArgs: 0,
    maxArgs: 1,
    apply(input: ExprValue, args: readonly ExprValue[]): FilterOutcome {
      const value = numberInput("round", input);
      if (!value.ok) return value;
      const decimals = integerArgument("round", args, 0, { fallback: 0, min: 0, max: maxDecimals });
      if (!decimals.ok) return decimals;
      // toFixed rounds half away from zero on the exact binary value, unlike Math.round.
      return success(Number(value.value.toFixed(decimals.value)));
    },
  },
  floor: math("floor", Math.floor),
  ceil: math("ceil", Math.ceil),
  abs: math("abs", Math.abs),
  sqrt: {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue): FilterOutcome {
      const value = numberInput("sqrt", input);
      if (!value.ok) return value;
      // -0 is not below zero: Math.sqrt(-0) is -0, written 0.
      if (value.value < 0) return failure("not-finite", "sqrt: the input is negative");
      return success(Math.sqrt(value.value));
    },
  },
  min: boundOrExtremum("min", Math.min),
  max: boundOrExtremum("max", Math.max),
  clamp: {
    minArgs: 2,
    maxArgs: 2,
    apply(input: ExprValue, args: readonly ExprValue[]): FilterOutcome {
      const value = numberInput("clamp", input);
      if (!value.ok) return value;
      const low = numberArgument("clamp", args, 0);
      if (!low.ok) return low;
      const high = numberArgument("clamp", args, 1);
      if (!high.ok) return high;
      if (low.value > high.value)
        return failure("argument", "clamp: the lower bound is above the upper");
      return success(Math.min(Math.max(value.value, low.value), high.value));
    },
  },
};
