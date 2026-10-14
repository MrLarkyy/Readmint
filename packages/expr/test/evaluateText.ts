import { expect } from "vitest";
import {
  compileTemplate,
  createScope,
  type ExpressionError,
  type ExprResult,
  type ExprValue,
  type ScopeOptions,
} from "../src/index.js";

/** Compiles and evaluates `text` against `data`; a compile error is returned as the result. */
export function evaluateText(
  text: string,
  data: Readonly<Record<string, unknown>> = {},
  options: ScopeOptions = {},
): ExprResult<ExprValue> {
  const template = compileTemplate(text);
  if (!template.ok) return template;
  return template.value.evaluate(createScope(data, options));
}

export function valueOf(
  text: string,
  data: Readonly<Record<string, unknown>> = {},
  options: ScopeOptions = {},
): ExprValue {
  const result = evaluateText(text, data, options);
  if (!result.ok) expect.fail(`${text}: unexpected ${result.error.code}: ${result.error.message}`);
  return result.value;
}

export function errorOf(
  text: string,
  data: Readonly<Record<string, unknown>> = {},
  options: ScopeOptions = {},
): ExpressionError {
  const result = evaluateText(text, data, options);
  if (result.ok) expect.fail(`${text}: expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}
