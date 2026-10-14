import type { ExpressionErrorCode } from "./ExpressionError.js";
import type { ExprValue } from "./ExprValue.js";
import type { FilterContext, FilterFailure, FilterOutcome } from "./FilterDefinition.js";
import type { LocaleData } from "./LocaleData.js";
import { resolveLocale } from "./locales.js";
import { typeName } from "./typeName.js";

/** A checked input or argument. Messages name the filter and the argument, never the value. */
export type Checked<T> = { readonly ok: true; readonly value: T } | FilterFailure;

export function success(value: ExprValue): FilterOutcome {
  return { ok: true, value };
}

export function failure(code: ExpressionErrorCode, message: string): FilterFailure {
  return { ok: false, code, message };
}

export function budgetFailure(): FilterFailure {
  return failure("budget", "evaluation exceeded its step budget");
}

export function numberInput(filter: string, input: ExprValue): Checked<number> {
  if (typeof input === "number") return { ok: true, value: input };
  return failure("type", `${filter} needs a number, got ${typeName(input)}`);
}

export function stringInput(filter: string, input: ExprValue): Checked<string> {
  if (typeof input === "string") return { ok: true, value: input };
  return failure("type", `${filter} needs a string, got ${typeName(input)}`);
}

/** Argument `index` (0-based); a missing or `null` argument takes `fallback` when there is one. */
export function integerArgument(
  filter: string,
  args: readonly ExprValue[],
  index: number,
  range: { readonly fallback?: number; readonly min: number; readonly max: number },
  aboveMax: ExpressionErrorCode = "argument",
): Checked<number> {
  const value = args[index] ?? null;
  const name = argumentName(filter, index);
  if (value === null) {
    return range.fallback === undefined
      ? failure("argument", `${name} is required`)
      : { ok: true, value: range.fallback };
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return failure("argument", `${name} must be an integer`);
  }
  if (value > range.max) return failure(aboveMax, `${name} must be at most ${String(range.max)}`);
  if (value < range.min)
    return failure("argument", `${name} must be at least ${String(range.min)}`);
  return { ok: true, value };
}

export function numberArgument(
  filter: string,
  args: readonly ExprValue[],
  index: number,
): Checked<number> {
  const value = args[index] ?? null;
  if (typeof value === "number") return { ok: true, value };
  return failure("argument", `${argumentName(filter, index)} must be a number`);
}

export function stringArgument(
  filter: string,
  args: readonly ExprValue[],
  index: number,
  fallback: string,
): Checked<string> {
  const value = args[index] ?? null;
  if (value === null) return { ok: true, value: fallback };
  if (typeof value === "string") return { ok: true, value };
  return failure("argument", `${argumentName(filter, index)} must be a string`);
}

/** The locale named by argument `index`, else the scope's locale. */
export function localeArgument(
  filter: string,
  args: readonly ExprValue[],
  index: number,
  context: FilterContext,
): Checked<LocaleData> {
  const value = args[index] ?? null;
  if (value !== null && typeof value !== "string") {
    return failure("argument", `${argumentName(filter, index)} must be a locale tag`);
  }
  const locale = resolveLocale(value ?? context.locale);
  if (locale === undefined) {
    return failure("unknown-locale", `${filter}: unknown locale (supported: en, de, fr, es, cs)`);
  }
  return { ok: true, value: locale };
}

function argumentName(filter: string, index: number): string {
  return `${filter}: argument ${String(index + 1)}`;
}
