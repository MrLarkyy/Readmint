import type { RenderScope } from "./ExpressionEvaluator.js";

/** The root scope: the own enumerable keys of plain-object data (none for anything else), on a null prototype. */
export function rootScope(data: unknown): RenderScope {
  const scope = Object.create(null) as Record<string, unknown>;
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    for (const key of Object.keys(data)) scope[key] = (data as Record<string, unknown>)[key];
  }
  return scope;
}

/** A copy of `parent` with `locals` on top; the parent is never changed. */
export function childScope(
  parent: RenderScope,
  locals: Readonly<Record<string, unknown>>,
): RenderScope {
  const scope = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(parent)) scope[key] = parent[key];
  for (const key of Object.keys(locals)) scope[key] = locals[key];
  return scope;
}
