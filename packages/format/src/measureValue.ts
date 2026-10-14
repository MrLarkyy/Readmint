import type { DesignIssue } from "./DesignIssue.js";
import { DesignLimits } from "./DesignLimits.js";
import { isPlainObject } from "./isPlainObject.js";

/**
 * Iterative bound check run before any recursive walk: nesting depth and the number of values.
 * Shared or cyclic references (YAML aliases, editor objects) are counted on every visit, so a
 * cycle ends as `too-deep` and an expansion bomb as `too-large`, never as a stack overflow.
 */
export function measureValue(value: unknown): DesignIssue | undefined {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let values = 1;
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const children = Array.isArray(entry.value)
      ? (entry.value as unknown[])
      : isPlainObject(entry.value)
        ? Object.values(entry.value)
        : undefined;
    if (children === undefined) continue;
    if (entry.depth > DesignLimits.maxDepth)
      return {
        path: "",
        code: "too-deep",
        message: `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`,
      };
    values += children.length;
    if (values > DesignLimits.maxValues)
      return {
        path: "",
        code: "too-large",
        message: `the document holds more than ${String(DesignLimits.maxValues)} values`,
      };
    for (const child of children) stack.push({ value: child, depth: entry.depth + 1 });
  }
  return undefined;
}
