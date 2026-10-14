import type { ExprValue } from "./ExprValue.js";
import {
  budgetFailure,
  failure,
  localeArgument,
  stringArgument,
  success,
} from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import { formatDate } from "./formatDate.js";
import { parseDate } from "./parseDate.js";
import { textSteps } from "./textSteps.js";
import { typeName } from "./typeName.js";

const maxPatternLength = 64;

export const dateFilters: Readonly<Record<string, FilterDefinition>> = {
  date: {
    minArgs: 0,
    maxArgs: 2,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      if (typeof input !== "string" && typeof input !== "number") {
        return failure(
          "type",
          `date needs an ISO 8601 string or epoch milliseconds, got ${typeName(input)}`,
        );
      }
      const epochMs = parseDate(input);
      if (epochMs === undefined) {
        return failure(
          "invalid-date",
          "date: not an ISO 8601 date or epoch milliseconds in the years 0000 to 9999",
        );
      }
      const locale = localeArgument("date", args, 1, context);
      if (!locale.ok) return locale;
      const pattern = stringArgument("date", args, 0, locale.value.datePattern);
      if (!pattern.ok) return pattern;
      if (pattern.value.length > maxPatternLength) {
        return failure(
          "argument",
          `date: the pattern is longer than ${String(maxPatternLength)} characters`,
        );
      }
      if (!context.charge(textSteps(pattern.value.length))) return budgetFailure();
      const text = formatDate(epochMs, pattern.value, locale.value);
      if (text === undefined) {
        return failure(
          "argument",
          "date: invalid pattern (unknown field letter, or an unclosed quote)",
        );
      }
      return success(text);
    },
  },
};
