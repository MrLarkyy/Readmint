import { failWith, type ErrorSite } from "./createError.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type { ExprResult } from "./ExprResult.js";
import { readProperty } from "./readProperty.js";
import type { Scope } from "./Scope.js";
import type { Template } from "./Template.js";
import { typeName } from "./typeName.js";

export interface RepeatOptions {
  /** Local name of the item; default `item`. */
  readonly as?: string;
  /** Local name of the 0-based position; default `index`. */
  readonly index?: string;
}

/**
 * A layer's `repeat`: one child scope per item of the array `template` evaluates to, with the item
 * and its 0-based index as locals. `null` (missing data) repeats nothing.
 */
export function expandRepeat(
  template: Template,
  scope: Scope,
  options: RepeatOptions = {},
): ExprResult<Scope[]> {
  const site: ErrorSite = {
    source: template.source,
    segment: { start: 0, end: template.source.length },
  };
  const span = site.segment;
  const itemName = options.as ?? "item";
  const indexName = options.index ?? "index";
  if (itemName === indexName) {
    return failWith(
      site,
      "argument",
      "repeat needs different names for the item and the index",
      span,
    );
  }
  const result = template.evaluate(scope);
  if (!result.ok) return result;
  const items = result.value;
  if (items === null) return { ok: true, value: [] };
  if (!Array.isArray(items)) {
    return failWith(site, "type", `repeat needs an array, got ${typeName(items)}`, span);
  }
  if (items.length > ExpressionLimits.maxArrayLength) {
    const limit = String(ExpressionLimits.maxArrayLength);
    return failWith(site, "too-large", `repeat allows at most ${limit} items`, span);
  }
  if (scope.budget !== undefined && !scope.budget.charge(items.length)) {
    const limit = String(scope.budget.maxSteps);
    return failWith(site, "budget", `evaluation exceeded its budget of ${limit} steps`, span);
  }
  const scopes: Scope[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = readProperty(items, index);
    if (!item.ok) {
      return failWith(site, "invalid-data", "a repeated item is not a JSON value", span);
    }
    scopes.push(scope.with({ [itemName]: item.value, [indexName]: index }));
  }
  return { ok: true, value: scopes };
}
