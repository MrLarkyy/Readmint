import { countCodePoints } from "./countCodePoints.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type { ExprValue } from "./ExprValue.js";
import { budgetFailure, failure, stringArgument, success } from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import { readProperty } from "./readProperty.js";
import { textSteps } from "./textSteps.js";
import { toText } from "./toText.js";
import { typeName } from "./typeName.js";

export const generalFilters: Readonly<Record<string, FilterDefinition>> = {
  default: {
    minArgs: 1,
    maxArgs: 1,
    acceptsNull: true,
    apply(input: ExprValue, args: readonly ExprValue[]): FilterOutcome {
      return success(input === null ? (args[0] ?? null) : input);
    },
  },
  length: {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue, _args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      if (Array.isArray(input)) return success(input.length);
      if (typeof input !== "string") {
        return failure("type", `length needs a string or an array, got ${typeName(input)}`);
      }
      if (!context.charge(textSteps(input.length))) return budgetFailure();
      return success(countCodePoints(input));
    },
  },
  join: {
    minArgs: 0,
    maxArgs: 1,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      if (!Array.isArray(input))
        return failure("type", `join needs an array, got ${typeName(input)}`);
      const separator = stringArgument("join", args, 0, ", ");
      if (!separator.ok) return separator;
      if (!context.charge(input.length)) return budgetFailure();
      let joined = "";
      for (let index = 0; index < input.length; index++) {
        const item = readProperty(input, index);
        if (!item.ok) return failure("invalid-data", "join: an item is not a JSON value");
        const text = toText(item.value);
        if (text === undefined) {
          return failure("type", "join: items must be strings, numbers, booleans or null");
        }
        const piece = index === 0 ? text : separator.value + text;
        if (joined.length + piece.length > ExpressionLimits.maxStringLength) {
          const limit = String(ExpressionLimits.maxStringLength);
          return failure("too-large", `join: the result is longer than ${limit} characters`);
        }
        if (!context.charge(textSteps(piece.length) - 1)) return budgetFailure();
        joined += piece;
      }
      return success(joined);
    },
  },
  first: {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue): FilterOutcome {
      if (Array.isArray(input)) return item("first", input, 0);
      if (typeof input === "string")
        return success(input.length === 0 ? "" : String.fromCodePoint(input.codePointAt(0) ?? 0));
      return failure("type", `first needs an array or a string, got ${typeName(input)}`);
    },
  },
  last: {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue): FilterOutcome {
      if (Array.isArray(input)) return item("last", input, input.length - 1);
      if (typeof input === "string") return success(lastCodePoint(input));
      return failure("type", `last needs an array or a string, got ${typeName(input)}`);
    },
  },
};

function item(name: string, array: readonly ExprValue[], index: number): FilterOutcome {
  const read = readProperty(array, index);
  return read.ok
    ? success(read.value)
    : failure("invalid-data", `${name}: the item is not a JSON value`);
}

function lastCodePoint(text: string): string {
  if (text.length === 0) return "";
  const low = text.charCodeAt(text.length - 1);
  const high = text.charCodeAt(text.length - 2);
  const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
  return text.slice(pair ? -2 : -1);
}
