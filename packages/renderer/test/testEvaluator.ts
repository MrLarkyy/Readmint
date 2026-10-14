import type { Binding } from "@readmint/format";
import type { ExpressionEvaluator, RenderScope } from "../src/index.js";

/**
 * Test-only stand-in for @readmint/expr: a binding is a dotted path (`user.name`, `items.0`) looked up through own
 * properties; text placeholders are filled with `String(value)`. Unknown paths give undefined.
 */
export const testEvaluator: ExpressionEvaluator = {
  evaluate(binding: Binding, scope: RenderScope): unknown {
    return lookup(binding.slice(2, -2).trim(), scope);
  },
  interpolate(template: string, scope: RenderScope): string {
    return template.replace(/\{\{([^}]*)\}\}/gu, (_match, path: string) =>
      String(lookup(path.trim(), scope)),
    );
  },
};

function lookup(path: string, scope: RenderScope): unknown {
  let value: unknown = scope;
  for (const key of path.split(".")) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return undefined;
    value = (value as Readonly<Record<string, unknown>>)[key];
  }
  return value;
}
