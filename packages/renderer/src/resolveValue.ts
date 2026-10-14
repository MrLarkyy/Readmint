import type { Binding, ValueRange } from "@readmint/format";
import { evaluateBinding } from "./expressions.js";
import type { Scope } from "@readmint/expr";
import { parseColour, type PaintColour } from "./parseColour.js";
import type { RenderContext } from "./RenderContext.js";

const maxEcho = 64;

export function isBinding(value: unknown): value is Binding {
  return (
    typeof value === "string" && value.length >= 4 && value.startsWith("{{") && value.endsWith("}}")
  );
}

/** A literal or binding value read as a number inside `range`. */
export function resolveNumber(
  context: RenderContext,
  value: unknown,
  path: string,
  range: ValueRange,
  scope: Scope,
): number {
  const actual = isBinding(value) ? evaluateBinding(context, value, path, scope) : value;
  if (typeof actual !== "number")
    context.fail(path, "type", `expected a number, got ${echo(actual)}`);
  if (!Number.isFinite(actual)) context.fail(path, "type", "expected a finite number");
  if (range.integer && !Number.isInteger(actual)) {
    context.fail(path, "type", `expected an integer, got ${String(actual)}`);
  }
  if (
    (range.minimum !== undefined && actual < range.minimum) ||
    (range.exclusiveMinimum !== undefined && actual <= range.exclusiveMinimum) ||
    actual > range.maximum
  ) {
    context.fail(path, "range", `${String(actual)} is outside ${describeRange(range)}`);
  }
  return actual;
}

export function resolveOptionalNumber(
  context: RenderContext,
  value: unknown,
  path: string,
  range: ValueRange,
  scope: Scope,
): number | undefined {
  return value === undefined ? undefined : resolveNumber(context, value, path, range, scope);
}

export function resolveBoolean(
  context: RenderContext,
  value: unknown,
  path: string,
  scope: Scope,
): boolean {
  const actual = isBinding(value) ? evaluateBinding(context, value, path, scope) : value;
  if (typeof actual !== "boolean") {
    context.fail(path, "type", `expected true or false, got ${echo(actual)}`);
  }
  return actual;
}

export function resolveColour(
  context: RenderContext,
  value: unknown,
  path: string,
  scope: Scope,
): PaintColour {
  const actual = isBinding(value) ? evaluateBinding(context, value, path, scope) : value;
  const colour = typeof actual === "string" ? parseColour(actual) : undefined;
  if (colour === undefined) {
    context.fail(
      path,
      "type",
      `expected a colour (#rgb, #rgba, #rrggbb, #rrggbbaa), got ${echo(actual)}`,
    );
  }
  return colour;
}

function describeRange(range: ValueRange): string {
  const low =
    range.exclusiveMinimum === undefined
      ? `[${String(range.minimum)}`
      : `(${String(range.exclusiveMinimum)}`;
  return `${low}, ${String(range.maximum)}]`;
}

/** A short, JSON-escaped picture of a value for a message. */
export function echo(value: unknown): string {
  if (typeof value === "string") {
    const shown = value.length > maxEcho ? `${value.slice(0, maxEcho)}...` : value;
    return JSON.stringify(shown);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
