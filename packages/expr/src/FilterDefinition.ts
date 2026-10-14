import type { ExpressionErrorCode } from "./ExpressionError.js";
import type { ExprValue } from "./ExprValue.js";

export interface FilterContext {
  /** The scope's locale tag; a `locale` argument overrides it. */
  readonly locale: string;
  /** Adds work to the evaluation budget before it is done; false once the budget is spent. */
  charge(steps: number): boolean;
}

export type FilterFailure = {
  readonly ok: false;
  readonly code: ExpressionErrorCode;
  /** Never contains the input or an argument value: they may come from the data. */
  readonly message: string;
};

export type FilterOutcome = { readonly ok: true; readonly value: ExprValue } | FilterFailure;

export interface FilterDefinition {
  readonly minArgs: number;
  readonly maxArgs: number;
  /** Only such a filter sees a `null` input; every other filter passes `null` through unchanged. */
  readonly acceptsNull?: boolean;
  apply(input: ExprValue, args: readonly ExprValue[], context: FilterContext): FilterOutcome;
}
