import {
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

function bound(
  name: string,
  operation: (value: number, limit: number) => number,
): FilterDefinition {
  return {
    minArgs: 1,
    maxArgs: 1,
    apply(input: ExprValue, args: readonly ExprValue[]): FilterOutcome {
      const value = numberInput(name, input);
      if (!value.ok) return value;
      const limit = numberArgument(name, args, 0);
      return limit.ok ? success(operation(value.value, limit.value)) : limit;
    },
  };
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
  min: bound("min", Math.min),
  max: bound("max", Math.max),
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
