import type { ExprResult } from "./ExprResult.js";
import { isTruthy } from "./isTruthy.js";
import type { Scope } from "./Scope.js";
import type { Template } from "./Template.js";

/** A layer's `if`: false for `false`, `null`, `0`, `""` and `[]`, true for anything else. */
export function evaluateCondition(template: Template, scope: Scope): ExprResult<boolean> {
  const result = template.evaluate(scope);
  return result.ok ? { ok: true, value: isTruthy(result.value) } : result;
}
