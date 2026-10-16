import {
  compileTemplate,
  evaluateCondition,
  expandRepeat,
  toText,
  type ExpressionError,
  type ExprValue,
  type RepeatOptions,
  type Scope,
  type Template,
} from "@readmint/expr";
import type { Repeat } from "@readmint/format";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo } from "./resolveValue.js";

/**
 * Every use of the expression language: bindings, `if`, `repeat` and text placeholders all go through
 * `@readmint/expr`, so the renderer has exactly its semantics (missing data is null, `[]` is falsy, null repeats
 * nothing, how values are written into text). An expression error ends the render with a `binding` issue; its
 * message never holds a value read from the data.
 */
function compiled(context: RenderContext, source: string, path: string): Template {
  let result = context.templates.get(source);
  if (result === undefined) {
    result = compileTemplate(source);
    context.templates.set(source, result);
  }
  if (!result.ok) fail(context, path, source, result.error);
  return result.value;
}

function fail(context: RenderContext, path: string, source: string, error: ExpressionError): never {
  return context.fail(path, "binding", `${echo(source)}: ${error.message} (${error.code})`);
}

/** The value of a bindable property, with its type. */
export function evaluateBinding(
  context: RenderContext,
  source: string,
  path: string,
  scope: Scope,
): ExprValue {
  const template = compiled(context, source, path);
  const result = at(context, path, () => template.evaluate(scope));
  if (!result.ok) fail(context, path, source, result.error);
  return result.value;
}

/** Runs an evaluation with `path` as the render's `expressionPath`. */
function at<T>(context: RenderContext, path: string, evaluate: () => T): T {
  const outer = context.expressionPath;
  context.expressionPath = path;
  try {
    return evaluate();
  } finally {
    context.expressionPath = outer;
  }
}

/** A layer's `if`: false for `false`, `null`, `0`, `""` and `[]`. */
export function evaluateIf(
  context: RenderContext,
  source: string,
  path: string,
  scope: Scope,
): boolean {
  const template = compiled(context, source, path);
  const result = at(context, path, () => evaluateCondition(template, scope));
  if (!result.ok) fail(context, path, source, result.error);
  return result.value;
}

/** One child scope per item of `repeat.each` (null repeats nothing); a problem with the names points at them. */
export function repeatScopes(
  context: RenderContext,
  repeat: Repeat,
  layerPath: string,
  scope: Scope,
): Scope[] {
  const repeatPath = pointer(layerPath, "repeat");
  const options: RepeatOptions = {
    ...(repeat.as === undefined ? {} : { as: repeat.as }),
    ...(repeat.index === undefined ? {} : { index: repeat.index }),
  };
  // The names are checked against a list that is surely empty, so their issue never points at `each`.
  const names = expandRepeat(compiled(context, "{{ null }}", repeatPath), scope, options);
  if (!names.ok) context.fail(repeatPath, "binding", `repeat: ${names.error.message}`);
  const eachPath = pointer(repeatPath, "each");
  const each = compiled(context, repeat.each, eachPath);
  const result = at(context, eachPath, () => expandRepeat(each, scope, options));
  if (!result.ok) fail(context, eachPath, repeat.each, result.error);
  return result.value;
}

/** A text content with its placeholders written in; a content that is one placeholder is converted to text. */
export function evaluateText(
  context: RenderContext,
  content: string,
  path: string,
  scope: Scope,
): string {
  if (!content.includes("{{")) return content;
  const value = evaluateBinding(context, content, path, scope);
  const text = toText(value);
  if (text === undefined) {
    context.fail(path, "type", `${echo(content)} gives ${echo(value)}, which has no text form`);
  }
  return text;
}
