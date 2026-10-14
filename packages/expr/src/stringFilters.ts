import { countCodePoints } from "./countCodePoints.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type { ExprValue } from "./ExprValue.js";
import {
  budgetFailure,
  failure,
  integerArgument,
  stringArgument,
  stringInput,
  success,
  type Checked,
} from "./filterArguments.js";
import type { FilterContext, FilterDefinition, FilterOutcome } from "./FilterDefinition.js";
import { textSteps } from "./textSteps.js";
import { typeName } from "./typeName.js";

const maxLength = ExpressionLimits.maxStringLength;

function mapping(name: string, operation: (text: string) => string): FilterDefinition {
  return {
    minArgs: 0,
    maxArgs: 0,
    apply(input: ExprValue, _args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const text = stringInput(name, input);
      if (!text.ok) return text;
      if (!context.charge(textSteps(text.value.length))) return budgetFailure();
      const result = operation(text.value);
      // Case mapping can grow a string (U+FB03 upper-cases to three letters).
      if (result.length > maxLength) return tooLarge(name);
      return success(result);
    },
  };
}

export const stringFilters: Readonly<Record<string, FilterDefinition>> = {
  // Locale-independent case mapping: the same in every engine and host locale.
  upper: mapping("upper", (text) => text.toUpperCase()),
  lower: mapping("lower", (text) => text.toLowerCase()),
  trim: mapping("trim", (text) => text.trim()),
  truncate: {
    minArgs: 1,
    maxArgs: 2,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const text = stringInput("truncate", input);
      if (!text.ok) return text;
      const length = integerArgument("truncate", args, 0, { min: 0, max: maxLength });
      if (!length.ok) return length;
      const suffix = stringArgument("truncate", args, 1, "…");
      if (!suffix.ok) return suffix;
      if (!context.charge(textSteps(text.value.length + suffix.value.length))) {
        return budgetFailure();
      }
      if (countCodePoints(text.value) <= length.value) return success(text.value);
      const suffixLength = countCodePoints(suffix.value);
      if (suffixLength > length.value) {
        return failure("argument", "truncate: the suffix is longer than the length");
      }
      const kept = Array.from(text.value).slice(0, length.value - suffixLength);
      return success(kept.join("") + suffix.value);
    },
  },
  padStart: {
    minArgs: 1,
    maxArgs: 2,
    apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome {
      const text = padInput(input);
      if (!text.ok) return text;
      const width = integerArgument("padStart", args, 0, { min: 0, max: maxLength }, "too-large");
      if (!width.ok) return width;
      const fill = stringArgument("padStart", args, 1, " ");
      if (!fill.ok) return fill;
      if (countCodePoints(fill.value) !== 1) {
        return failure("argument", "padStart: argument 2 must be exactly one character");
      }
      const missing = width.value - countCodePoints(text.value);
      if (missing <= 0) return success(text.value);
      const resultLength = text.value.length + missing * fill.value.length;
      if (resultLength > maxLength) return tooLarge("padStart");
      if (!context.charge(textSteps(resultLength))) return budgetFailure();
      return success(fill.value.repeat(missing) + text.value);
    },
  },
};

/** Numbers are padded too (`{{ day | padStart(2, "0") }}`), written as in text. */
function padInput(input: ExprValue): Checked<string> {
  if (typeof input === "string") return { ok: true, value: input };
  if (typeof input === "number") return { ok: true, value: String(input) };
  return failure("type", `padStart needs a string or a number, got ${typeName(input)}`);
}

function tooLarge(name: string): FilterOutcome {
  return failure("too-large", `${name}: the result is longer than ${String(maxLength)} characters`);
}
