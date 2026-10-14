import type { Budget } from "./Budget.js";
import { failWith, type ErrorSite } from "./createError.js";
import type { ExpressionErrorCode } from "./ExpressionError.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type {
  ArrayNode,
  BinaryOperator,
  ChainNode,
  ExprNode,
  LogicalNode,
  NameNode,
  PathNode,
  PipeNode,
  UnaryNode,
} from "./ExprNode.js";
import type { ExprResult } from "./ExprResult.js";
import type { ExprValue } from "./ExprValue.js";
import type { FilterContext } from "./FilterDefinition.js";
import { filterRegistry } from "./FilterRegistry.js";
import { isTruthy } from "./isTruthy.js";
import { readProperty } from "./readProperty.js";
import type { Scope } from "./Scope.js";
import { shortenName } from "./shortenName.js";
import type { Span } from "./Span.js";
import { textSteps } from "./textSteps.js";
import { typeName } from "./typeName.js";

export interface EvalContext {
  readonly site: ErrorSite;
  readonly scope: Scope;
  readonly budget: Budget;
}

/**
 * Walks the tree of one placeholder. Every node costs one budget step; work proportional to the
 * size of a string or an array is charged before it is done, and every size limit is checked
 * before the memory is allocated. Messages name types and operators, never values.
 */
export function evaluateNode(node: ExprNode, context: EvalContext): ExprResult<ExprValue> {
  if (!context.budget.charge(1)) return budgetExceeded(context, node);
  switch (node.kind) {
    case "literal":
      return ok(node.value);
    case "array":
      return evaluateArray(node, context);
    case "name":
      return evaluateName(node, context);
    case "path":
      return evaluatePath(node, context);
    case "unary":
      return evaluateUnary(node, context);
    case "chain":
      return evaluateChain(node, context);
    case "logical":
      return evaluateLogical(node, context);
    case "conditional": {
      const test = evaluateNode(node.test, context);
      if (!test.ok) return test;
      return evaluateNode(isTruthy(test.value) ? node.consequent : node.alternate, context);
    }
    case "pipe":
      return evaluatePipe(node, context);
  }
}

function evaluateArray(node: ArrayNode, context: EvalContext): ExprResult<ExprValue> {
  if (node.items.length > ExpressionLimits.maxArrayLength) {
    const limit = String(ExpressionLimits.maxArrayLength);
    return fail(context, "too-large", `an array may hold at most ${limit} items`, node);
  }
  const items: ExprValue[] = [];
  for (const item of node.items) {
    const value = evaluateNode(item, context);
    if (!value.ok) return value;
    items.push(value.value);
  }
  return ok(items);
}

function evaluateName(node: NameNode, context: EvalContext): ExprResult<ExprValue> {
  const found = context.scope.lookup(node.name);
  if (found === undefined) {
    const hint = node.name.includes("-") ? " (write a - b with spaces to subtract)" : "";
    return fail(context, "unknown-name", `unknown name ${shortenName(node.name)}${hint}`, node);
  }
  if (!found.ok) return invalidData(context, node);
  return ok(found.value);
}

function evaluatePath(node: PathNode, context: EvalContext): ExprResult<ExprValue> {
  const target = evaluateNode(node.target, context);
  if (!target.ok) return target;
  let value = target.value;
  for (const step of node.steps) {
    if (value === null) return ok(null);
    if (!context.budget.charge(1)) return budgetExceeded(context, step);
    let key: string | number;
    if (step.kind === "property") {
      key = step.name;
    } else {
      const index = evaluateNode(step.key, context);
      if (!index.ok) return index;
      if (index.value === null) return ok(null);
      if (typeof index.value !== "string" && typeof index.value !== "number") {
        const got = typeName(index.value);
        return fail(context, "type", `an index must be a string or a number, got ${got}`, step);
      }
      key = index.value;
    }
    const read = readProperty(value, key);
    if (!read.ok) return invalidData(context, step);
    value = read.value;
  }
  return ok(value);
}

function evaluateUnary(node: UnaryNode, context: EvalContext): ExprResult<ExprValue> {
  const operand = evaluateNode(node.operand, context);
  if (!operand.ok) return operand;
  if (node.operator === "!") return ok(!isTruthy(operand.value));
  if (typeof operand.value !== "number") {
    return fail(context, "type", `unary - needs a number, got ${typeName(operand.value)}`, node);
  }
  return ok(-operand.value);
}

function evaluateChain(node: ChainNode, context: EvalContext): ExprResult<ExprValue> {
  const first = evaluateNode(node.first, context);
  if (!first.ok) return first;
  let value = first.value;
  for (const link of node.links) {
    const right = evaluateNode(link.operand, context);
    if (!right.ok) return right;
    const result = applyBinary(link.operator, value, right.value, context, link);
    if (!result.ok) return result;
    value = result.value;
  }
  return ok(value);
}

function applyBinary(
  operator: BinaryOperator,
  left: ExprValue,
  right: ExprValue,
  context: EvalContext,
  span: Span,
): ExprResult<ExprValue> {
  if (operator === "==" || operator === "!=") {
    const withNull = left === null || right === null;
    if (!withNull && (!isComparable(left) || !isComparable(right))) {
      const types = `${typeName(left)} and ${typeName(right)}`;
      return fail(
        context,
        "type",
        `${operator} compares strings, numbers, booleans and null, got ${types}`,
        span,
      );
    }
    return ok(operator === "==" ? left === right : left !== right);
  }
  if (operator === "+" && typeof left === "string" && typeof right === "string") {
    const length = left.length + right.length;
    if (length > ExpressionLimits.maxStringLength) {
      const limit = String(ExpressionLimits.maxStringLength);
      return fail(
        context,
        "too-large",
        `the string would be longer than ${limit} characters`,
        span,
      );
    }
    if (!context.budget.charge(textSteps(length))) return budgetExceeded(context, span);
    return ok(left + right);
  }
  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    return compare(operator, left, right, context, span);
  }
  if (typeof left !== "number" || typeof right !== "number") {
    const types = `${typeName(left)} and ${typeName(right)}`;
    const needs = operator === "+" ? "two numbers or two strings" : "two numbers";
    return fail(context, "type", `${operator} needs ${needs}, got ${types}`, span);
  }
  const result = arithmetic(operator, left, right);
  if (!Number.isFinite(result)) {
    return fail(context, "not-finite", `${operator} gives no finite number`, span);
  }
  return ok(result);
}

function arithmetic(operator: "+" | "-" | "*" | "/" | "%", left: number, right: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
  }
}

/** Numbers with numbers, strings with strings (by UTF-16 code unit, the same in every engine). */
function compare(
  operator: "<" | "<=" | ">" | ">=",
  left: ExprValue,
  right: ExprValue,
  context: EvalContext,
  span: Span,
): ExprResult<ExprValue> {
  if (typeof left === "number" && typeof right === "number") {
    return ok(relate(operator, left, right));
  }
  if (typeof left === "string" && typeof right === "string") {
    if (!context.budget.charge(textSteps(Math.min(left.length, right.length)))) {
      return budgetExceeded(context, span);
    }
    return ok(relate(operator, left, right));
  }
  const types = `${typeName(left)} and ${typeName(right)}`;
  return fail(context, "type", `${operator} needs two numbers or two strings, got ${types}`, span);
}

function relate<T extends number | string>(
  operator: "<" | "<=" | ">" | ">=",
  left: T,
  right: T,
): boolean {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function isComparable(value: ExprValue): boolean {
  return value === null || typeof value !== "object";
}

/** `a && b` and `a || b` give one of their operands, like JavaScript, with this language's falsy values. */
function evaluateLogical(node: LogicalNode, context: EvalContext): ExprResult<ExprValue> {
  let result: ExprResult<ExprValue> = ok(null);
  for (const [index, operand] of node.operands.entries()) {
    if (index > 0 && result.ok) {
      const truthy = isTruthy(result.value);
      if (node.operator === "&&" ? !truthy : truthy) return result;
    }
    result = evaluateNode(operand, context);
    if (!result.ok) return result;
  }
  return result;
}

function evaluatePipe(node: PipeNode, context: EvalContext): ExprResult<ExprValue> {
  const input = evaluateNode(node.input, context);
  if (!input.ok) return input;
  let value = input.value;
  const filterContext: FilterContext = {
    locale: context.scope.locale,
    charge: (steps) => context.budget.charge(steps),
  };
  for (const call of node.filters) {
    if (!context.budget.charge(1)) return budgetExceeded(context, call);
    const definition = filterRegistry.get(call.name);
    if (definition === undefined) {
      return fail(context, "unknown-filter", `unknown filter ${shortenName(call.name)}`, call);
    }
    if (value === null && definition.acceptsNull !== true) continue;
    const args: ExprValue[] = [];
    for (const argument of call.args) {
      const evaluated = evaluateNode(argument, context);
      if (!evaluated.ok) return evaluated;
      args.push(evaluated.value);
    }
    const outcome = definition.apply(value, args, filterContext);
    if (!outcome.ok) return fail(context, outcome.code, outcome.message, call);
    value = outcome.value;
  }
  return ok(value);
}

function ok(value: ExprValue): ExprResult<ExprValue> {
  return { ok: true, value };
}

function fail(
  context: EvalContext,
  code: ExpressionErrorCode,
  message: string,
  span: Span,
): ExprResult<ExprValue> {
  return failWith(context.site, code, message, span);
}

function invalidData(context: EvalContext, span: Span): ExprResult<ExprValue> {
  const message =
    "the data here is not a JSON value (accessor, function, class instance or non-finite number)";
  return fail(context, "invalid-data", message, span);
}

function budgetExceeded(context: EvalContext, span: Span): ExprResult<ExprValue> {
  const limit = String(context.budget.maxSteps);
  return fail(context, "budget", `evaluation exceeded its budget of ${limit} steps`, span);
}
